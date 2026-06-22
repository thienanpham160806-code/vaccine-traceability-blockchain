import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { importZkpService } from '../services/importZkp';
import { CryptoUtils } from '../utils/crypto';
import { QRCodeGenerator } from '../utils/qr';
import { Logger } from '../utils/logger';
import { Batch, Product } from '../types';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  bulkProductsSchema,
  productListQuerySchema,
  productParamsSchema,
  registerProductSchema,
  updateProductSchema,
} from '../schemas/productSchemas';

const router = Router();
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const productRegistryEvents = new ethers.Interface([
  'event ProductRegistered(bytes32 indexed serialID, bytes32 indexed batchHash, address indexed owner, bool isImported, bool zkpVerified, uint8 status)',
]);

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function httpError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sameHex(left?: string, right?: string): boolean {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

function normalizeAddress(address?: string): string {
  return String(address || '').toLowerCase();
}

function requireProductRegistryEvent(receipt: any, eventName: string) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = productRegistryEvents.parseLog(log);
      if (parsed?.name === eventName) {
        return parsed;
      }
    } catch {
      // Ignore logs emitted by other contracts in the same transaction.
    }
  }

  throw httpError(400, 'TX_EVENT_MISMATCH', `Transaction did not emit ${eventName}`);
}

async function resolveProductBySerial(serialId: string): Promise<{ product: Product; serialHash: string } | null> {
  const decodedSerialId = decodeURIComponent(serialId).trim();
  const computedHash = toBytes32(decodedSerialId);

  // Parallel: try hash-keyed path + serial-index simultaneously
  const [hashSnap, indexSnap] = await Promise.all([
    db.ref(`products/${computedHash}`).once('value'),
    db.ref(`serial-index/${decodedSerialId}`).once('value'),
  ]);

  if (hashSnap.exists()) {
    const product = hashSnap.val() as Product;
    return { product, serialHash: (product as any).serialHash || computedHash };
  }

  const indexedHash: string | null = indexSnap.val();
  if (indexedHash && indexedHash !== computedHash) {
    const idxProductSnap = await db.ref(`products/${indexedHash}`).once('value');
    if (idxProductSnap.exists()) {
      const product = idxProductSnap.val() as Product;
      return { product, serialHash: (product as any).serialHash || indexedHash };
    }
  }

  // Last resort: try raw serialId as key (legacy data stored without hashing)
  const rawSnap = await db.ref(`products/${decodedSerialId}`).once('value');
  if (rawSnap.exists()) {
    const product = rawSnap.val() as Product;
    return { product, serialHash: (product as any).serialHash || computedHash };
  }

  return null;
}

async function readFirebaseValue(path: string, fallback: any = null) {
  try {
    const snapshot = await db.ref(path).once('value');
    return snapshot.val() ?? fallback;
  } catch (error) {
    Logger.warn(`Could not read Firebase path ${path}`, error);
    return fallback;
  }
}

function getErrorMessage(error: any, fallback: string): string {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

async function requireSuccessfulTx(txHash: string, expectedTo?: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    const error: any = new Error('Invalid transaction hash');
    error.statusCode = 400;
    error.code = 'INVALID_TX_HASH';
    throw error;
  }

  const receipt = await contractClient.getProvider().getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    const error: any = new Error('Transaction is not confirmed successfully on-chain');
    error.statusCode = 400;
    error.code = 'TX_NOT_CONFIRMED';
    throw error;
  }

  if (expectedTo && receipt.to && receipt.to.toLowerCase() !== expectedTo.toLowerCase()) {
    const error: any = new Error('Transaction target does not match the active contract');
    error.statusCode = 400;
    error.code = 'TX_CONTRACT_MISMATCH';
    throw error;
  }

  return receipt;
}

function normalizeText(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

const TRANSFERABLE_PRODUCT_STATUSES = new Set([
  'REGISTERED',
  'VERIFIED',
  'DELIVERED',
  'DELIVERED_TO_DISTRIBUTOR',
  'DELIVERED_TO_CLINIC',
  'DELIVERED_TO_PHARMACY',
]);
const TRANSFER_INITIATOR_ROLES = new Set(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR']);
const INVENTORY_ROLES = new Set(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY']);
const INVENTORY_TRANSFER_ROUTES: Record<string, string[]> = {
  MANUFACTURER: ['DISTRIBUTOR'],
  IMPORTER: ['DISTRIBUTOR'],
  DISTRIBUTOR: ['CLINIC', 'PHARMACY'],
  CLINIC: [],
  PHARMACY: [],
};

/**
 * GET /products/transferable
 * Return products owned by the authenticated wallet and ready for a new transfer.
 * ADMIN may inspect another operational role by passing ?role=...
 */
router.get(
  '/transferable',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY', 'ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      const requestedRole = String(req.query.role || req.user?.role || '').toUpperCase();
      const ownerRole = req.user?.role === 'ADMIN' ? requestedRole : String(req.user?.role || '');

      if (!INVENTORY_ROLES.has(ownerRole)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_OWNER_ROLE', message: `Role ${ownerRole || 'UNKNOWN'} does not own operational inventory.` },
        });
      }

      const ownerAddress =
        req.user?.role === 'ADMIN'
          ? contractClient.getRoleAddress(ownerRole)
          : String(req.user?.address || '');

      if (!ownerAddress || !CryptoUtils.isValidAddress(ownerAddress)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_OWNER_ADDRESS', message: 'Authenticated profile does not have a valid wallet address.' },
        });
      }

      const [productsSnapshot, transfersSnapshot] = await Promise.all([
        db.ref('products').once('value'),
        db.ref('transfers').once('value'),
      ]);
      const productEntries = Object.entries(productsSnapshot.val() || {}) as Array<[string, Product]>;
      const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
      const latestConfirmedBySerial = new Map<string, any>();
      const latestTransferBySerial = new Map<string, any>();

      for (const transfer of transfers) {
        if (!transfer?.serialId) continue;
        const timestamp = transfer.confirmedAt || transfer.rejectedAt || transfer.returnedAt || transfer.updatedAt || transfer.createdAt || 0;
        const latest = latestTransferBySerial.get(transfer.serialId);
        const latestTimestamp =
          latest?.confirmedAt || latest?.rejectedAt || latest?.returnedAt || latest?.updatedAt || latest?.createdAt || 0;
        if (!latest || timestamp >= latestTimestamp) {
          latestTransferBySerial.set(transfer.serialId, transfer);
        }

        if (transfer.status !== 'CONFIRMED') continue;

        const current = latestConfirmedBySerial.get(transfer.serialId);
        const currentTimestamp = current?.confirmedAt || current?.updatedAt || current?.createdAt || 0;
        if (!current || timestamp >= currentTimestamp) {
          latestConfirmedBySerial.set(transfer.serialId, transfer);
        }
      }

      const normalizedOwner = normalizeAddress(ownerAddress);
      const repairs: Promise<unknown>[] = [];
      const items = productEntries.flatMap(([productKey, product]) => {
        const latestTransfer = latestConfirmedBySerial.get(product.serialId);
        const resolvedOwner = latestTransfer?.toAddress || product.currentOwner || '';
        const resolvedRole =
          latestTransfer?.toRole ||
          product.ownerRole ||
          (normalizeAddress(resolvedOwner) === normalizedOwner ? ownerRole : '');

        if (
          resolvedOwner &&
          (normalizeAddress(product.currentOwner) !== normalizeAddress(resolvedOwner) ||
            product.ownerRole !== resolvedRole)
        ) {
          repairs.push(
            db.ref(`products/${productKey}`).update({
              currentOwner: resolvedOwner,
              ownerRole: resolvedRole || null,
              updatedAt: Date.now(),
            })
          );
        }

        if (normalizeAddress(resolvedOwner) !== normalizedOwner) return [];
        if (resolvedRole && resolvedRole !== ownerRole) return [];
        if (latestTransferBySerial.get(product.serialId)?.status === 'PENDING') return [];
        if (!TRANSFERABLE_PRODUCT_STATUSES.has(String(product.status))) return [];

        return [{ ...product, currentOwner: resolvedOwner, ownerRole: resolvedRole || ownerRole }];
      });

      if (repairs.length > 0) {
        await Promise.allSettled(repairs);
      }

      items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      res.json({
        success: true,
        data: {
          items,
          total: items.length,
          ownerAddress,
          ownerRole,
          canTransfer: TRANSFER_INITIATOR_ROLES.has(ownerRole),
          allowedToRoles: INVENTORY_TRANSFER_ROUTES[ownerRole] || [],
        },
      });
    } catch (error) {
      Logger.error('Get transferable products error', error);
      res.status(500).json({
        success: false,
        error: { code: 'GET_TRANSFERABLE_PRODUCTS_ERROR', message: getErrorMessage(error, 'Failed to fetch transferable products') },
      });
    }
  }
);

/**
 * GET /products?search=&status=&manufacturer=&sort=&page=&pageSize=
 * List products with search, filter, sort, and pagination
 */
router.get('/', validateRequest({ query: productListQuerySchema }), async (req: Request, res: Response) => {
  try {
    const {
      search,
      status,
      manufacturer,
      owner,
      batch,
      origin,
      sort = 'createdAt:desc',
      page: rawPage,
      pageSize: rawPageSize,
    } = req.query;

    Logger.info('Fetching products list', {
      search,
      status,
      manufacturer,
      owner,
      batch,
      origin,
      sort,
      page: rawPage,
      pageSize: rawPageSize,
    });

    const productsRef = db.ref('products');
    const snapshot = await productsRef.once('value');
    const productsData = snapshot.val() || {};

    let products: Product[] = Object.values(productsData);

    const searchText = normalizeText(String(search || ''));
    const statusText = normalizeText(String(status || ''));
    const manufacturerText = normalizeText(String(manufacturer || ''));
    const ownerText = normalizeAddress(String(owner || ''));
    const batchText = normalizeText(String(batch || ''));
    const originText = normalizeText(String(origin || ''));

    if (searchText) {
      products = products.filter((product) => {
        const searchable = [
          product.serialId,
          product.batchId,
          product.batchHash,
          product.productName,
          product.manufacturerName,
          product.manufacturerAddress,
          product.currentOwner,
        ]
          .map(normalizeText)
          .join(' ');

        return searchable.includes(searchText);
      });
    }

    if (statusText && statusText !== 'all') {
      products = products.filter(
        (product) => normalizeText(product.status) === statusText
      );
    }

    if (manufacturerText) {
      products = products.filter((product) => {
        return (
          normalizeText(product.manufacturerName).includes(manufacturerText) ||
          normalizeText(product.manufacturerAddress).includes(manufacturerText)
        );
      });
    }

    if (ownerText) {
      products = products.filter(
        (product) => normalizeAddress(product.currentOwner) === ownerText
      );
    }

    if (batchText) {
      products = products.filter((product) => {
        return (
          normalizeText(product.batchId).includes(batchText) ||
          normalizeText(product.batchHash).includes(batchText)
        );
      });
    }

    if (originText) {
      products = products.filter((product) => {
        const productOrigin = product.isImported ? 'imported' : 'manufactured';
        return productOrigin === originText;
      });
    }

    const [sortField, sortDirection = 'asc'] = String(sort).split(':');
    const direction = sortDirection === 'desc' ? -1 : 1;

    products.sort((a, b) => {
      switch (sortField) {
        case 'expiryDate':
          return (
            new Date(a.expiryDate).getTime() -
            new Date(b.expiryDate).getTime()
          ) * direction;

        case 'productName':
          return a.productName.localeCompare(b.productName) * direction;

        case 'status':
          return a.status.localeCompare(b.status) * direction;

        case 'manufacturerName':
          return a.manufacturerName.localeCompare(b.manufacturerName) * direction;

        case 'batchId':
          return String(a.batchId || '').localeCompare(String(b.batchId || '')) * direction;

        case 'batchHash':
          return String(a.batchHash || '').localeCompare(String(b.batchHash || '')) * direction;

        case 'origin':
          return (Number(a.isImported) - Number(b.isImported)) * direction;

        case 'createdAt':
        default:
          return ((a.createdAt || 0) - (b.createdAt || 0)) * direction;
      }
    });

    const page = parsePositiveInt(rawPage, 1);
    const pageSize = Math.min(parsePositiveInt(rawPageSize, 10), 100);
    const total = products.length;
    const start = (page - 1) * pageSize;
    const items = products.slice(start, start + pageSize);

    Logger.info(`Retrieved ${items.length}/${total} products`);

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    Logger.error('Get products error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRODUCTS_ERROR',
        message: 'Failed to fetch products',
      },
    });
  }
});

/**
 * GET /products/:serialId/detail
 * Get full product details with batch, transfer timeline, risk flags, recall, and chain summary
 */
router.get('/:serialId/detail', validateRequest({ params: productParamsSchema }), async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Fetching product detail: ${serialId}`);

    const resolvedProduct = await resolveProductBySerial(serialId);

    if (!resolvedProduct) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with serial ID ${serialId} not found`,
        },
      });
    }

    const { product, serialHash } = resolvedProduct;
    const normalizedSerialId = product.serialId || serialId;
    const batchKey = product.batchHash || product.batchId;

    // Query only matching records via index instead of full-collection scans
    const [batch, transfersBySerial, transfersByHash, riskFlagsBySerial, riskFlagsByHash, recallByBatchHash, recallByBatchId] = await Promise.all([
      batchKey ? readFirebaseValue(`batches/${batchKey}`, null) : Promise.resolve(null),
      db.ref('transfers').orderByChild('serialId').equalTo(normalizedSerialId).once('value'),
      normalizedSerialId !== serialHash
        ? db.ref('transfers').orderByChild('serialHash').equalTo(serialHash).once('value')
        : Promise.resolve(null),
      db.ref('risk-flags').orderByChild('serialId').equalTo(normalizedSerialId).once('value'),
      normalizedSerialId !== serialHash
        ? db.ref('risk-flags').orderByChild('serialHash').equalTo(serialHash).once('value')
        : Promise.resolve(null),
      product.batchHash
        ? db.ref('recalls').orderByChild('batchHash').equalTo(product.batchHash).once('value')
        : Promise.resolve(null),
      product.batchId && product.batchId !== product.batchHash
        ? db.ref('recalls').orderByChild('batchId').equalTo(product.batchId).once('value')
        : Promise.resolve(null),
    ]);

    const timelineMap = new Map<string, any>();
    for (const snap of [transfersBySerial, transfersByHash]) {
      if (snap?.exists()) {
        snap.forEach((child: any) => { timelineMap.set(child.key, child.val()); });
      }
    }
    const timeline = Array.from(timelineMap.values());

    const riskFlagMap = new Map<string, any>();
    for (const snap of [riskFlagsBySerial, riskFlagsByHash]) {
      if (snap?.exists()) {
        snap.forEach((child: any) => { riskFlagMap.set(child.key, child.val()); });
      }
    }
    const riskFlags = Array.from(riskFlagMap.values());

    let recall: any = null;
    for (const snap of [recallByBatchHash, recallByBatchId]) {
      if (snap?.exists()) {
        snap.forEach((child: any) => { if (!recall) recall = child.val(); });
        if (recall) break;
      }
    }

    let blockchain: {
      serialHash: string;
      txHash?: string;
      currentOwner: string;
      status: string;
      transferHistory: any[];
      available: boolean;
    } = {
      serialHash,
      txHash: product.blockchainTx,
      currentOwner: product.currentOwner,
      status: String(product.status),
      transferHistory: [] as any[],
      available: false,
    };

    if (contractClient.isInitialized()) {
      try {
        const [chainProduct, transferHistory] = await Promise.all([
          contractClient.getProduct(serialHash),
          contractClient.getTransferHistory(serialHash),
        ]);

        blockchain = {
          ...blockchain,
          currentOwner: chainProduct.currentOwner || product.currentOwner,
          status: String(chainProduct.status ?? product.status),
          transferHistory,
          available: true,
        };
      } catch (chainError) {
        Logger.warn('Could not load product detail from blockchain', chainError);
      }
    }

    res.json({
      success: true,
      data: {
        product,
        batch,
        timeline,
        riskFlags,
        recall,
        blockchain,
      },
    });
  } catch (error) {
    Logger.error('Get product detail error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRODUCT_DETAIL_ERROR',
        message: 'Failed to fetch product detail',
      },
    });
  }
});

/**
 * PUT /products/:serialId
 * Update editable off-chain product metadata only
 */
router.put('/:serialId', validateRequest({ params: productParamsSchema, body: updateProductSchema }), async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;
    const {
      productName,
      manufacturerName,
      expiryDate,
      notes,
    } = req.body;

    Logger.info(`Updating product metadata: ${serialId}`);

    const serialHash = toBytes32(serialId);
    let productKey = serialHash;
    let productSnapshot = await db.ref(`products/${productKey}`).once('value');

    if (!productSnapshot.exists()) {
      productKey = serialId;
      productSnapshot = await db.ref(`products/${productKey}`).once('value');
    }

    if (!productSnapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with serial ID ${serialId} not found`,
        },
      });
    }

    const existingProduct = productSnapshot.val() as Product;
    const updates: Partial<Product> = {};

    if (productName !== undefined) {
      if (typeof productName !== 'string' || productName.trim() === '') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PRODUCT_NAME',
            message: 'productName must be a non-empty string',
          },
        });
      }

      updates.productName = productName.trim();
    }

    if (manufacturerName !== undefined) {
      if (typeof manufacturerName !== 'string' || manufacturerName.trim() === '') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MANUFACTURER_NAME',
            message: 'manufacturerName must be a non-empty string',
          },
        });
      }

      updates.manufacturerName = manufacturerName.trim();
    }

    if (expiryDate !== undefined) {
      if (typeof expiryDate !== 'string' || Number.isNaN(new Date(expiryDate).getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EXPIRY_DATE',
            message: 'expiryDate must be a valid date string',
          },
        });
      }

      updates.expiryDate = expiryDate;
    }

    if (notes !== undefined) {
      if (typeof notes !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_NOTES',
            message: 'notes must be a string',
          },
        });
      }

      updates.notes = notes.trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_EDITABLE_FIELDS',
          message: 'Provide at least one editable field: productName, manufacturerName, expiryDate, notes',
        },
      });
    }

    const now = Date.now();
    const updatedProduct: Product = {
      ...existingProduct,
      ...updates,
      updatedAt: now,
    };

    const batchUpdates: Partial<Batch> = {};

    if (updates.productName !== undefined) {
      batchUpdates.productName = updates.productName;
    }

    if (updates.manufacturerName !== undefined) {
      batchUpdates.manufacturerName = updates.manufacturerName;
    }

    if (updates.expiryDate !== undefined) {
      batchUpdates.expiryDate = updates.expiryDate;
    }

    const rootUpdates: Record<string, unknown> = {
      [`products/${productKey}`]: updatedProduct,
    };

    const batchKey = existingProduct.batchHash || existingProduct.batchId;

    if (batchKey && Object.keys(batchUpdates).length > 0) {
      Object.entries(batchUpdates).forEach(([key, value]) => {
        rootUpdates[`batches/${batchKey}/${key}`] = value;
      });
      rootUpdates[`batches/${batchKey}/updatedAt`] = now;
    }

    await db.ref().update(rootUpdates);

    res.json({
      success: true,
      data: {
        product: updatedProduct,
        editableFieldsUpdated: Object.keys(updates),
        readOnlyFields: [
          'serialId',
          'batchHash',
          'currentOwner',
          'status',
          'riskLevel',
          'blockchainTx',
          'isImported',
          'zkpVerified',
        ],
      },
    });
  } catch (error) {
    Logger.error('Update product metadata error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_PRODUCT_ERROR',
        message: 'Failed to update product metadata',
      },
    });
  }
});

/**
 * GET /products/:serialId
 * Get product by serial ID
 */
router.get('/:serialId', validateRequest({ params: productParamsSchema }), async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Fetching product: ${serialId}`);

    const productKey = toBytes32(serialId);
    const productRef = db.ref(`products/${productKey}`);
    let snapshot = await productRef.once('value');

    if (!snapshot.exists()) {
      snapshot = await db.ref(`products/${serialId}`).once('value');
    }

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with serial ID ${serialId} not found`,
        },
      });
    }

    const product = snapshot.val() as Product;

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    Logger.error('Get product error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRODUCT_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

/**
 * POST /products/register
 * Register new product (batch)
 */
router.post('/register', validateRequest({ body: registerProductSchema }), async (req: Request, res: Response) => {
  try {
    const {
      serialId,
      batchId,
      batchHash: rawBatchHash,
      metadataHash: rawMetadataHash,
      productName,
      manufacturerName = 'Unknown manufacturer',
      manufacturerAddress,
      expiryDate,
      quantity = 1,
      origin = 'MANUFACTURED',
      importDocHash: rawImportDocHash,
      zkpProof,
      importDocument,
    } = req.body;

    if (!serialId || !productName || !expiryDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, productName, expiryDate',
        },
      });
    }

    Logger.info(`Registering product: ${serialId}`);

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'CONTRACTS_NOT_READY',
          message: 'Smart contracts are not initialized',
        },
      });
    }

    const serialHash = toBytes32(serialId);
    const existingProductSnapshot = await db.ref(`products/${serialHash}`).once('value');
    if (existingProductSnapshot.exists()) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SERIAL_ALREADY_EXISTS',
          message: `Product with serial ID ${serialId} already exists`,
        },
        timestamp: Date.now(),
      });
    }

    const isImported = origin === 'IMPORTED';
    const batchQR = isImported
      ? (importDocument?.batchNo || batchId || QRCodeGenerator.generateBatchId())
      : (batchId || QRCodeGenerator.generateBatchId());
    const batchHash = isImported
      ? importZkpService.batchNoToBytes32(batchQR)
      : (rawBatchHash ? toBytes32(rawBatchHash) : toBytes32(batchQR));
    const metadataPayload = {
      serialId,
      serialHash,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: manufacturerAddress || contractClient.getWalletAddress(),
      expiryDate,
      quantity,
      origin,
      createdAt: Date.now(),
    };
    const metadataHash = rawMetadataHash
      ? toBytes32(rawMetadataHash)
      : toBytes32(JSON.stringify(metadataPayload));
    const importDocHash = rawImportDocHash ? toBytes32(rawImportDocHash) : ZERO_BYTES32;
    const proofBytes = zkpProof || '0x';
    const signerRole = isImported ? 'IMPORTER' : 'MANUFACTURER';
    const signerHasRequiredRole = await contractClient.signerHasRole(signerRole);
    if (!signerHasRequiredRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SIGNER_ROLE_NOT_GRANTED',
          message: `Backend ${signerRole} signer does not have ${signerRole}_ROLE on the active AccessControl contract. Grant the role or update the role private key for the current network.`,
        },
        timestamp: Date.now(),
      });
    }

    const qrContent = QRCodeGenerator.encodeQRContent(batchHash, metadataHash);
    const qrImage = await QRCodeGenerator.generateQRImage(qrContent);
    const ipfsResult = await ipfsService.pinJson(`batch-${batchQR}-${serialId}`, {
      ...metadataPayload,
      metadataHash,
      qrContent,
    });

    let txHash: string;
    let importDocumentIpfsCid: string | undefined;
    let importDocCommitment: string | undefined;
    let approvedImportRoot: string | undefined;
    let importProofMode: string | undefined;

    if (isImported) {
      const importDocIpfsResult = await ipfsService.pinJson(`import-doc-${batchQR}-${serialId}`, {
        ...importDocument,
        serialId,
        batchHash,
        metadataHash,
      });
      importDocumentIpfsCid = importDocIpfsResult?.cid;

      const zkp = await importZkpService.generateRegistrationProof({
        importDocument,
        batchHash,
        vaccineExpiryDate: expiryDate,
      });

      const onChainRoot = await contractClient.getApprovedImportRoot();
      if (onChainRoot !== zkp.approvedRoot) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'IMPORT_ROOT_NOT_APPROVED_ON_CHAIN',
            message: 'Approved import root is not set on-chain. Run POST /import-zkp/approvals before registering imported products.',
          },
          timestamp: Date.now(),
        });
      }

      txHash = await contractClient.registerImportedProductZK(
        serialHash,
        batchHash,
        metadataHash,
        zkp.proof,
        signerRole
      );
      importDocCommitment = zkp.commitment;
      approvedImportRoot = zkp.approvedRoot;
      importProofMode = zkp.proof.mode;
    } else {
      txHash = await contractClient.registerProduct(
        serialHash,
        batchHash,
        metadataHash,
        importDocHash,
        proofBytes,
        signerRole
      );
    }

    const now = Date.now();
    const batch: Batch = {
      id: batchQR,
      batchHash,
      batchQR,
      metadataHash,
      productName,
      quantity,
      manufacturerAddress: manufacturerAddress || contractClient.getRoleAddress(signerRole),
      manufacturerName,
      expiryDate,
      origin: isImported ? 'IMPORTED' : 'MANUFACTURED',
      ipfsCid: ipfsResult?.cid,
      ...(importDocumentIpfsCid ? { importDocumentIpfsCid } : {}),
      ...(importDocCommitment ? { importDocCommitment } : {}),
      ...(approvedImportRoot ? { approvedImportRoot } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const product: Product = {
      serialId,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: batch.manufacturerAddress,
      currentOwner: contractClient.getRoleAddress(signerRole),
      ownerRole: signerRole,
      status: 'VERIFIED',
      riskLevel: 'SAFE',
      expiryDate,
      isImported,
      zkpVerified: isImported ? true : Boolean(zkpProof && importDocHash !== ZERO_BYTES32),
      blockchainTx: txHash,
      ...(importDocumentIpfsCid ? { importDocumentIpfsCid } : {}),
      ...(importDocCommitment ? { importDocCommitment } : {}),
      ...(approvedImportRoot ? { approvedImportRoot } : {}),
      ...(importProofMode ? { importProofMode } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`batches/${batchHash}`).update(batch),
      db.ref(`products/${serialHash}`).set(product),
      db.ref(`serial-index/${serialId}`).set(serialHash),
    ]);

    res.json({
      success: true,
      data: {
        product,
        batch,
        batchHash,
        metadataHash,
        serialHash,
        ipfsCid: ipfsResult?.cid,
        importDocumentIpfsCid,
        importDocCommitment,
        approvedImportRoot,
        importProofMode,
        qrContent,
        qrImage,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Register product error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTER_ERROR',
        message: getErrorMessage(error, 'Failed to register product'),
      },
    });
  }
});

/**
 * POST /products/sync-wallet-register
 * Sync Firebase/IPFS after a user-signed ProductRegistry.registerProduct tx.
 */
router.post('/sync-wallet-register', verifyToken, validateRequest({ body: registerProductSchema.safeExtend({
  txHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be a transaction hash'),
}) }), async (req: AuthRequest, res: Response) => {
  try {
    const {
      txHash,
      serialId,
      batchId,
      batchHash: rawBatchHash,
      metadataHash: rawMetadataHash,
      productName,
      manufacturerName = 'Unknown manufacturer',
      expiryDate,
      quantity = 1,
      origin = 'MANUFACTURED',
      importDocHash: rawImportDocHash,
      zkpProof,
    } = req.body;

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: { code: 'CONTRACTS_NOT_READY', message: 'Smart contracts are not initialized' },
      });
    }

    const serialHash = toBytes32(serialId);
    const batchQR = batchId || QRCodeGenerator.generateBatchId();
    const batchHash = rawBatchHash ? toBytes32(rawBatchHash) : toBytes32(batchQR);
    const receipt = await requireSuccessfulTx(txHash, contractClient.productRegistry?.target as string);
    const event = requireProductRegistryEvent(receipt, 'ProductRegistered');
    const eventOwner = String(event.args.owner);

    if (!sameHex(String(event.args.serialID), serialHash)) {
      throw httpError(400, 'TX_SERIAL_MISMATCH', 'Transaction serial does not match request payload');
    }

    if (!sameHex(String(event.args.batchHash), batchHash)) {
      throw httpError(400, 'TX_BATCH_MISMATCH', 'Transaction batch does not match request payload');
    }

    if (req.user?.role !== 'ADMIN' && normalizeAddress(eventOwner) !== normalizeAddress(req.user?.address)) {
      throw httpError(403, 'TX_OWNER_MISMATCH', 'Transaction owner does not match the authenticated wallet');
    }

    if (receipt.from && !sameHex(String(receipt.from), eventOwner)) {
      throw httpError(400, 'TX_SENDER_MISMATCH', 'Transaction sender does not match the ProductRegistered owner');
    }

    const existsOnChain = await contractClient.productExists(serialHash);
    if (!existsOnChain) {
      return res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND_ON_CHAIN', message: 'Transaction confirmed but product was not found on-chain.' },
      });
    }

    const existingProductSnapshot = await db.ref(`products/${serialHash}`).once('value');
    if (existingProductSnapshot.exists()) {
      return res.status(409).json({
        success: false,
        error: { code: 'SERIAL_ALREADY_EXISTS', message: `Product with serial ID ${serialId} already exists` },
      });
    }

    const metadataPayload = {
      serialId,
      serialHash,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: req.user?.address || contractClient.getWalletAddress(),
      expiryDate,
      quantity,
      origin,
      createdAt: Date.now(),
    };
    const metadataHash = rawMetadataHash
      ? toBytes32(rawMetadataHash)
      : toBytes32(JSON.stringify(metadataPayload));
    const importDocHash = rawImportDocHash ? toBytes32(rawImportDocHash) : ZERO_BYTES32;
    const qrContent = QRCodeGenerator.encodeQRContent(batchHash, metadataHash);
    const qrImage = await QRCodeGenerator.generateQRImage(qrContent);
    const ipfsResult = await ipfsService.pinJson(`wallet-batch-${batchQR}-${serialId}`, {
      ...metadataPayload,
      metadataHash,
      qrContent,
    });

    const now = Date.now();
    const batch: Batch = {
      id: batchQR,
      batchHash,
      batchQR,
      metadataHash,
      productName,
      quantity,
      manufacturerAddress: metadataPayload.manufacturerAddress,
      manufacturerName,
      expiryDate,
      origin: origin === 'IMPORTED' ? 'IMPORTED' : 'MANUFACTURED',
      ipfsCid: ipfsResult?.cid,
      createdAt: now,
      updatedAt: now,
    };

    const product: Product = {
      serialId,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: batch.manufacturerAddress,
      currentOwner: batch.manufacturerAddress,
      ownerRole: origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER',
      status: 'VERIFIED',
      riskLevel: 'SAFE',
      expiryDate,
      isImported: origin === 'IMPORTED',
      zkpVerified: Boolean(zkpProof && importDocHash !== ZERO_BYTES32),
      blockchainTx: txHash,
      metadataHash,
      ipfsCid: ipfsResult?.cid,
      qrImage,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`batches/${batchHash}`).update(batch),
      db.ref(`products/${serialHash}`).set(product),
      db.ref(`serial-index/${serialId}`).set(serialHash),
    ]);

    res.json({
      success: true,
      data: { product, batch, batchHash, metadataHash, serialHash, ipfsCid: ipfsResult?.cid, qrContent, qrImage, txHash },
    });
  } catch (error: any) {
    Logger.error('Sync wallet product registration error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'WALLET_REGISTER_SYNC_ERROR',
        message: error.message || 'Failed to sync wallet registration',
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /products/bulk
 * Bulk register products from a JSON array.
 *
 * MVP payload:
 * {
 *   "products": [
 *     {
 *       "serialId": "VCN-001",
 *       "batchId": "BATCH-001",
 *       "productName": "Hexaxim Vaccine",
 *       "manufacturerName": "Local Manufacturer",
 *       "expiryDate": "2027-01-01",
 *       "origin": "MANUFACTURED"
 *     }
 *   ]
 * }
 */
router.post('/bulk', validateRequest({ body: bulkProductsSchema }), async (req: Request, res: Response) => {
  try {
    const { products: rawProducts } = req.body;

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BULK_PAYLOAD',
          message: 'products must be a non-empty array',
        },
      });
    }

    if (rawProducts.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BULK_LIMIT_EXCEEDED',
          message: 'Bulk registration supports at most 50 products per request',
        },
      });
    }

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'CONTRACTS_NOT_READY',
          message: 'Smart contracts are not initialized',
        },
      });
    }

    Logger.info(`Bulk registering ${rawProducts.length} products`);

    // Pre-batch all Firebase existence checks in parallel to avoid N sequential reads
    const preCheckSerials = rawProducts
      .map((p: any) => (typeof p?.serialId === 'string' ? p.serialId.trim() : null))
      .filter(Boolean) as string[];
    const existenceSnaps = await Promise.all(
      preCheckSerials.map((sid) => db.ref(`products/${toBytes32(sid)}`).once('value'))
    );
    const existingSet = new Set<string>(
      preCheckSerials.filter((_, i) => existenceSnaps[i].exists())
    );

    const results = [];
    const seenSerials = new Set<string>();

    for (let index = 0; index < rawProducts.length; index++) {
      const rawProduct = rawProducts[index];

      try {
        const serialId = requireString(rawProduct?.serialId, `products[${index}].serialId`);
        const productName = requireString(rawProduct?.productName, `products[${index}].productName`);
        const expiryDate = requireString(rawProduct?.expiryDate, `products[${index}].expiryDate`);

        if (seenSerials.has(serialId)) {
          throw new Error(`products[${index}].serialId duplicates another row in this request`);
        }
        seenSerials.add(serialId);

        if (Number.isNaN(new Date(expiryDate).getTime())) {
          throw new Error(`products[${index}].expiryDate must be a valid date string`);
        }

        const manufacturerName =
          typeof rawProduct?.manufacturerName === 'string' && rawProduct.manufacturerName.trim()
            ? rawProduct.manufacturerName.trim()
            : 'Unknown manufacturer';
        const origin = rawProduct?.origin === 'IMPORTED' ? 'IMPORTED' : 'MANUFACTURED';
        const isImported = origin === 'IMPORTED';
        if (isImported && !rawProduct?.importDocument) {
          throw new Error(`products[${index}].importDocument is required for imported products`);
        }
        const quantity = parsePositiveInt(rawProduct?.quantity, 1);
        const batchQR =
          isImported
            ? rawProduct.importDocument.batchNo
            : typeof rawProduct?.batchId === 'string' && rawProduct.batchId.trim()
            ? rawProduct.batchId.trim()
            : QRCodeGenerator.generateBatchId();

        const serialHash = toBytes32(serialId);
        if (existingSet.has(serialId)) {
          throw new Error(`Product with serial ID ${serialId} already exists`);
        }

        const batchHash = isImported
          ? importZkpService.batchNoToBytes32(batchQR)
          : typeof rawProduct?.batchHash === 'string' && rawProduct.batchHash.trim()
            ? toBytes32(rawProduct.batchHash)
            : toBytes32(batchQR);
        const importDocHash =
          typeof rawProduct?.importDocHash === 'string' && rawProduct.importDocHash.trim()
            ? toBytes32(rawProduct.importDocHash)
            : ZERO_BYTES32;
        const zkpProof =
          typeof rawProduct?.zkpProof === 'string' && rawProduct.zkpProof.trim()
            ? rawProduct.zkpProof
            : '0x';
        const signerRole = isImported ? 'IMPORTER' : 'MANUFACTURER';
        const signerHasRequiredRole = await contractClient.signerHasRole(signerRole);
        if (!signerHasRequiredRole) {
          throw new Error(
            `Backend ${signerRole} signer does not have ${signerRole}_ROLE on the active AccessControl contract`
          );
        }

        const metadataPayload = {
          serialId,
          serialHash,
          batchId: batchQR,
          batchHash,
          productName,
          manufacturerName,
          manufacturerAddress: rawProduct?.manufacturerAddress || contractClient.getRoleAddress(signerRole),
          expiryDate,
          quantity,
          origin,
          createdAt: Date.now(),
        };
        const metadataHash =
          typeof rawProduct?.metadataHash === 'string' && rawProduct.metadataHash.trim()
            ? toBytes32(rawProduct.metadataHash)
            : toBytes32(JSON.stringify(metadataPayload));
        const qrContent = QRCodeGenerator.encodeQRContent(batchHash, metadataHash);
        const qrImage = await QRCodeGenerator.generateQRImage(qrContent);
        const ipfsResult = await ipfsService.pinJson(`bulk-batch-${batchQR}-${serialId}`, {
          ...metadataPayload,
          metadataHash,
          qrContent,
        });
        let txHash: string;
        let importDocumentIpfsCid: string | undefined;
        let importDocCommitment: string | undefined;
        let approvedImportRoot: string | undefined;
        let importProofMode: string | undefined;

        if (isImported) {
          const importDocIpfsResult = await ipfsService.pinJson(`bulk-import-doc-${batchQR}-${serialId}`, {
            ...rawProduct.importDocument,
            serialId,
            batchHash,
            metadataHash,
          });
          importDocumentIpfsCid = importDocIpfsResult?.cid;

          const zkp = await importZkpService.generateRegistrationProof({
            importDocument: rawProduct.importDocument,
            batchHash,
            vaccineExpiryDate: expiryDate,
          });
          const onChainRoot = await contractClient.getApprovedImportRoot();
          if (onChainRoot !== zkp.approvedRoot) {
            throw new Error('Approved import root is not set on-chain for imported product');
          }

          txHash = await contractClient.registerImportedProductZK(
            serialHash,
            batchHash,
            metadataHash,
            zkp.proof,
            signerRole
          );
          importDocCommitment = zkp.commitment;
          approvedImportRoot = zkp.approvedRoot;
          importProofMode = zkp.proof.mode;
        } else {
          txHash = await contractClient.registerProduct(
            serialHash,
            batchHash,
            metadataHash,
            importDocHash,
            zkpProof,
            signerRole
          );
        }
        const now = Date.now();
        const batch: Batch = {
          id: batchQR,
          batchHash,
          batchQR,
          metadataHash,
          productName,
          quantity,
          manufacturerAddress: metadataPayload.manufacturerAddress,
          manufacturerName,
          expiryDate,
          origin,
          ipfsCid: ipfsResult?.cid,
          ...(importDocumentIpfsCid ? { importDocumentIpfsCid } : {}),
          ...(importDocCommitment ? { importDocCommitment } : {}),
          ...(approvedImportRoot ? { approvedImportRoot } : {}),
          createdAt: now,
          updatedAt: now,
        };
        const product: Product = {
          serialId,
          batchId: batchQR,
          batchHash,
          productName,
          manufacturerName,
          manufacturerAddress: batch.manufacturerAddress,
          currentOwner: contractClient.getRoleAddress(signerRole),
          ownerRole: signerRole,
          status: 'VERIFIED',
          riskLevel: 'SAFE',
          expiryDate,
          isImported,
          zkpVerified: isImported ? true : Boolean(zkpProof && zkpProof !== '0x' && importDocHash !== ZERO_BYTES32),
          blockchainTx: txHash,
          metadataHash,
          ipfsCid: ipfsResult?.cid,
          qrImage,
          ...(importDocumentIpfsCid ? { importDocumentIpfsCid } : {}),
          ...(importDocCommitment ? { importDocCommitment } : {}),
          ...(approvedImportRoot ? { approvedImportRoot } : {}),
          ...(importProofMode ? { importProofMode } : {}),
          createdAt: now,
          updatedAt: now,
        };

        await Promise.all([
          db.ref(`batches/${batchHash}`).update(batch),
          db.ref(`products/${serialHash}`).set(product),
          db.ref(`serial-index/${serialId}`).set(serialHash),
        ]);

        results.push({
          index,
          serialId,
          serialHash,
          success: true,
          product,
          batch,
          txHash,
          ipfsCid: ipfsResult?.cid,
        });
      } catch (itemError) {
        Logger.warn(`Bulk product registration failed at index ${index}`, itemError);
        results.push({
          index,
          serialId: rawProduct?.serialId,
          success: false,
          error: getErrorMessage(itemError, 'Failed to register product'),
        });
      }
    }

    const successful = results.filter((result) => result.success).length;
    const failed = results.length - successful;

    res.status(failed > 0 ? 207 : 200).json({
      success: failed === 0,
      data: {
        total: results.length,
        successful,
        failed,
        results,
      },
    });
  } catch (error) {
    Logger.error('Bulk register products error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BULK_REGISTER_ERROR',
        message: 'Failed to bulk register products',
      },
    });
  }
});

/**
 * POST /products/:serialId/reregister
 * Re-register a Firebase-only product on the current chain.
 * Needed when products were originally registered on a local node or an old deployment
 * but the backend now points to a new contract. Requires MANUFACTURER, IMPORTER, or ADMIN role.
 */
router.post(
  '/:serialId/reregister',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'ADMIN']),
  validateRequest({ params: productParamsSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { serialId } = req.params;
      const decodedSerialId = decodeURIComponent(serialId).trim();
      const serialHash = toBytes32(decodedSerialId);

      let productKey = serialHash;
      let snapshot = await db.ref(`products/${productKey}`).once('value');
      if (!snapshot.exists()) {
        productKey = decodedSerialId;
        snapshot = await db.ref(`products/${productKey}`).once('value');
      }

      if (!snapshot.exists()) {
        return res.status(404).json({
          success: false,
          error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${decodedSerialId} not found in Firebase` },
        });
      }

      if (!contractClient.isInitialized()) {
        return res.status(503).json({
          success: false,
          error: { code: 'CONTRACTS_NOT_READY', message: 'Smart contracts are not initialized' },
        });
      }

      const existsOnChain = await contractClient.productExists(serialHash);
      if (existsOnChain) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_ON_CHAIN', message: `Product ${decodedSerialId} is already registered on the current contract.` },
        });
      }

      const product = snapshot.val() as Product;
      const batchHash = product.batchHash || toBytes32(product.batchId || decodedSerialId);
      const metadataHash = (product as any).metadataHash || toBytes32(JSON.stringify({ serialId: decodedSerialId }));
      const signerRole = product.isImported ? 'IMPORTER' : 'MANUFACTURER';

      Logger.info(`Re-registering product ${decodedSerialId} on-chain (role: ${signerRole})`);
      const txHash = await contractClient.registerProduct(
        serialHash,
        batchHash,
        metadataHash,
        ZERO_BYTES32,
        '0x',
        signerRole
      );

      const now = Date.now();
      await db.ref(`products/${productKey}`).update({ blockchainTx: txHash, updatedAt: now });

      Logger.success(`Re-registered ${decodedSerialId} → tx ${txHash}`);

      res.json({
        success: true,
        data: { txHash, serialHash, serialId: decodedSerialId },
      });
    } catch (error) {
      Logger.error('Re-register product error', error);
      res.status(500).json({
        success: false,
        error: { code: 'REREGISTER_ERROR', message: getErrorMessage(error, 'Failed to re-register product on-chain') },
      });
    }
  }
);

export default router;

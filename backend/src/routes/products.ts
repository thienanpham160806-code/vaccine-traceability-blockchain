import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { CryptoUtils } from '../utils/crypto';
import { QRCodeGenerator } from '../utils/qr';
import { Logger } from '../utils/logger';
import { Batch, Product } from '../types';
import { verifyToken, AuthRequest } from '../middleware/auth';
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

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

async function resolveProductBySerial(serialId: string): Promise<{ product: Product; serialHash: string } | null> {
  const decodedSerialId = decodeURIComponent(serialId).trim();
  const computedHash = toBytes32(decodedSerialId);

  let snapshot = await db.ref(`products/${computedHash}`).once('value');
  if (snapshot.exists()) {
    const product = snapshot.val() as Product;
    return { product, serialHash: (product as any).serialHash || computedHash };
  }

  snapshot = await db.ref(`products/${decodedSerialId}`).once('value');
  if (snapshot.exists()) {
    const product = snapshot.val() as Product;
    return { product, serialHash: (product as any).serialHash || computedHash };
  }

  const indexSnapshot = await db.ref(`serial-index/${decodedSerialId}`).once('value');
  const indexedHash = indexSnapshot.val();
  if (indexedHash) {
    snapshot = await db.ref(`products/${indexedHash}`).once('value');
    if (snapshot.exists()) {
      const product = snapshot.val() as Product;
      return { product, serialHash: (product as any).serialHash || indexedHash };
    }
  }

  const productsSnapshot = await db.ref('products').once('value');
  const products = Object.values(productsSnapshot.val() || {}) as Product[];
  const product = products.find((item: any) => item?.serialId === decodedSerialId || item?.serialHash === decodedSerialId);

  if (!product) return null;

  return {
    product,
    serialHash: (product as any).serialHash || toBytes32(product.serialId || decodedSerialId),
  };
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
      sort = 'createdAt:desc',
      page: rawPage,
      pageSize: rawPageSize,
    } = req.query;

    Logger.info('Fetching products list', {
      search,
      status,
      manufacturer,
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

    const [
      batchSnapshot,
      transfersSnapshot,
      riskFlagsSnapshot,
      recallsSnapshot,
    ] = await Promise.all([
      batchKey ? db.ref(`batches/${batchKey}`).once('value') : Promise.resolve(null),
      db.ref('transfers').once('value'),
      db.ref('risk-flags').once('value'),
      db.ref('recalls').once('value'),
    ]);

    const allTransfers = transfersSnapshot.val() || {};
    const timeline = Object.values(allTransfers).filter((transfer: any) => {
      return transfer.serialId === normalizedSerialId || transfer.serialId === serialHash || transfer.serialHash === serialHash;
    });

    const allRiskFlags = riskFlagsSnapshot.val() || {};
    const riskFlags = Object.values(allRiskFlags).filter((flag: any) => {
      return flag.serialId === normalizedSerialId || flag.serialId === serialHash || flag.serialHash === serialHash;
    });

    const allRecalls = recallsSnapshot.val() || {};
    const recall = Object.values(allRecalls).find((item: any) => {
      return item.batchHash === product.batchHash || item.id === product.batchHash;
    }) || null;

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
        batch: batchSnapshot?.val() || null,
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

    const batchQR = batchId || QRCodeGenerator.generateBatchId();
    const batchHash = rawBatchHash ? toBytes32(rawBatchHash) : toBytes32(batchQR);
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
    const signerRole = origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER';
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

    const txHash = await contractClient.registerProduct(
      serialHash,
      batchHash,
      metadataHash,
      importDocHash,
      proofBytes,
      signerRole
    );

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
      currentOwner: contractClient.getRoleAddress(signerRole),
      status: 'VERIFIED',
      riskLevel: 'SAFE',
      expiryDate,
      isImported: origin === 'IMPORTED',
      zkpVerified: Boolean(zkpProof && importDocHash !== ZERO_BYTES32),
      blockchainTx: txHash,
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
router.post('/sync-wallet-register', verifyToken, validateRequest({ body: registerProductSchema.extend({
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

    await requireSuccessfulTx(txHash, contractClient.productRegistry?.target as string);

    const serialHash = toBytes32(serialId);
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

    const batchQR = batchId || QRCodeGenerator.generateBatchId();
    const batchHash = rawBatchHash ? toBytes32(rawBatchHash) : toBytes32(batchQR);
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
        const quantity = parsePositiveInt(rawProduct?.quantity, 1);
        const batchQR =
          typeof rawProduct?.batchId === 'string' && rawProduct.batchId.trim()
            ? rawProduct.batchId.trim()
            : QRCodeGenerator.generateBatchId();

        const serialHash = toBytes32(serialId);
        const existingProductSnapshot = await db.ref(`products/${serialHash}`).once('value');
        if (existingProductSnapshot.exists()) {
          throw new Error(`Product with serial ID ${serialId} already exists`);
        }

        const batchHash =
          typeof rawProduct?.batchHash === 'string' && rawProduct.batchHash.trim()
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
        const signerRole = origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER';
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
        const txHash = await contractClient.registerProduct(
          serialHash,
          batchHash,
          metadataHash,
          importDocHash,
          zkpProof,
          signerRole
        );
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
          status: 'VERIFIED',
          riskLevel: 'SAFE',
          expiryDate,
          isImported: origin === 'IMPORTED',
          zkpVerified: Boolean(zkpProof && zkpProof !== '0x' && importDocHash !== ZERO_BYTES32),
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

export default router;

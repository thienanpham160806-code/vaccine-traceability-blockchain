import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { TransferRecord } from '../types';
import { txQueue } from '../services/txQueue';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { decorateTransfer, getVisibilityContext, transferVisibleTo } from '../services/visibility';
import {
  transferBulkScanSchema,
  transferConfirmSchema,
  transferIdParamsSchema,
  transferRejectSchema,
  transferScanSchema,
} from '../schemas/transferSchemas';

const router = Router();
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,128}$/;
const txHashSchema = z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be a transaction hash');
const transferLedgerEvents = new ethers.Interface([
  'event TransferRequested(bytes32 indexed serialID, address indexed sender, address indexed receiver, bytes32 fromLocationHash, bytes32 toLocationHash, uint256 requestedAt)',
  'event TransferConfirmed(bytes32 indexed serialID, address indexed sender, address indexed receiver, uint256 confirmedAt)',
  'event TransferRejected(bytes32 indexed serialID, address indexed sender, address indexed receiver, bytes32 reason)',
]);
const allowedTransferRoutes: Record<string, string[]> = {
  MANUFACTURER: ['DISTRIBUTOR'],
  IMPORTER: ['DISTRIBUTOR'],
  DISTRIBUTOR: ['CLINIC', 'PHARMACY'],
};
const transferReceiverActionRoles = ['IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY', 'ADMIN', 'RECALL_AUTHORITY'];

function toBytes32(value?: string): string {
  if (!value) return ZERO_BYTES32;
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function getErrorMessage(error: any, fallback: string): string {
  const raw =
    error?.shortMessage ||
    error?.reason ||
    error?.revert?.args?.[0] ||
    error?.error?.reason ||
    error?.error?.message ||
    error?.info?.error?.message ||
    error?.message ||
    fallback;

  if (typeof raw !== 'string') return fallback;
  if (/missing revert data/i.test(raw)) {
    return `${fallback}. Smart contract reverted before returning a reason. Check that the selected wallet is the on-chain owner/receiver and that the product is not pending, flagged, or recalled.`;
  }
  return raw;
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

function buildTransferMetadata(body: any) {
  return pruneUndefined({
    fromLocationName: body.fromLocationName || body.fromLocation || undefined,
    toLocationName: body.toLocationName || undefined,
    fromWarehouseName: body.fromWarehouseName || undefined,
    toWarehouseName: body.toWarehouseName || undefined,
    carrierName: body.carrierName || undefined,
    vehicleId: body.vehicleId || undefined,
    departedAt: body.departedAt,
    arrivedAt: body.arrivedAt,
    temperatureMinC: body.temperatureMinC,
    temperatureMaxC: body.temperatureMaxC,
    temperatureUnit: body.temperatureUnit || (body.temperatureMinC !== undefined || body.temperatureMaxC !== undefined ? 'C' : undefined),
    handlingNotes: body.handlingNotes || undefined,
  });
}

function pruneUndefined<T extends Record<string, any>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as Partial<T>;
}

function requireReceiptEvent(receipt: any, eventName: string) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = transferLedgerEvents.parseLog(log);
      if (parsed?.name === eventName) {
        return parsed;
      }
    } catch {
      // Ignore logs emitted by other contracts in the same transaction.
    }
  }

  throw httpError(400, 'TX_EVENT_MISMATCH', `Transaction did not emit ${eventName}`);
}

function isAllowedTransferRoute(fromRole: string, toRole: string): boolean {
  return allowedTransferRoutes[fromRole]?.includes(toRole) || false;
}

function authenticatedUserHasRole(req: AuthRequest, role: string): boolean {
  const roles = req.user?.roles?.length ? req.user.roles : [req.user?.role];
  return roles.filter(Boolean).includes(role);
}

function canActAsRole(req: AuthRequest, role: string): boolean {
  return req.user?.role === 'ADMIN' || req.user?.role === 'RECALL_AUTHORITY' || authenticatedUserHasRole(req, role);
}

function productRegistryStatusToProductStatus(status: number): TransferRecord['status'] | 'REGISTERED' | 'VERIFIED' | 'IN_TRANSIT' | 'DELIVERED' | 'FLAGGED' | 'RECALLED' {
  const statuses = ['REGISTERED', 'VERIFIED', 'IN_TRANSIT', 'DELIVERED', 'FLAGGED', 'RECALLED'] as const;
  return statuses[status] || 'VERIFIED';
}

function canCreateOnChainTransfer(status: number): boolean {
  // ProductRegistry.markInTransit only accepts VERIFIED or DELIVERED.
  return status === 1 || status === 3;
}

async function resolvePendingTransfer(serialId: string, serialHash: string): Promise<[string, TransferRecord] | null> {
  // O(1) lookup via pending-transfers index, fallback to orderByChild if index missing
  const indexSnap = await db.ref(`pending-transfers/${serialHash}`).once('value');
  const indexedId: string | null = indexSnap.val();
  if (indexedId) {
    const snap = await db.ref(`transfers/${indexedId}`).once('value');
    if (snap.exists()) {
      const t = snap.val() as TransferRecord;
      if (t.status === 'PENDING') return [indexedId, t];
    }
  }
  // Fallback: indexed query (uses .indexOn serialId from database rules)
  const snap = await db.ref('transfers').orderByChild('serialId').equalTo(serialId).once('value');
  let found: [string, TransferRecord] | null = null;
  snap.forEach((child: any) => {
    const t = child.val() as TransferRecord;
    if (t.status === 'PENDING' && !found) found = [child.key as string, t];
  });
  return found;
}

function getDeliveredStatus(toRole: string): string {
  switch (toRole) {
    case 'DISTRIBUTOR': return 'DELIVERED_TO_DISTRIBUTOR';
    case 'CLINIC': return 'DELIVERED_TO_CLINIC';
    case 'PHARMACY': return 'DELIVERED_TO_PHARMACY';
    default: return 'DELIVERED';
  }
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

async function createTransferForSerial(req: AuthRequest, serialId: string, groupId?: string) {
  const {
    receiverAddress: rawReceiverAddress,
    fromRole,
    toRole,
    fromLocationHash,
    toLocationHash,
    fromLocation,
  } = req.body;

  if (!serialId || !fromRole || !toRole) {
    throw httpError(400, 'MISSING_FIELDS', 'Missing required fields: serialId, fromRole, toRole');
  }

  if (!SAFE_ID_PATTERN.test(serialId)) {
    throw httpError(400, 'INVALID_SERIAL_ID', 'Serial chỉ được dùng chữ, số, dấu gạch ngang hoặc gạch dưới.');
  }

  if (!canActAsRole(req, fromRole)) {
    throw httpError(403, 'ROLE_MISMATCH', `Only ${fromRole} can create this transfer`);
  }

  if (!isAllowedTransferRoute(fromRole, toRole)) {
    throw httpError(400, 'INVALID_TRANSFER_ROUTE', `Route ${fromRole} -> ${toRole} is not allowed by the supply-chain route matrix`);
  }

  const receiverAddress = rawReceiverAddress || contractClient.getRoleAddress(toRole);
  if (!CryptoUtils.isValidAddress(receiverAddress)) {
    throw httpError(400, 'INVALID_RECEIVER', 'receiverAddress must be a valid Ethereum address');
  }

  if (!contractClient.isInitialized()) {
    throw httpError(503, 'CONTRACTS_NOT_READY', 'Smart contracts are not initialized');
  }

  const serialHash = toBytes32(serialId);
  const existsOnChain = await contractClient.productExists(serialHash);
  const productSnapshot = await db.ref(`products/${serialHash}`).once('value');
  const productData = productSnapshot.val();

  if (!existsOnChain) {
    throw httpError(
      404,
      'PRODUCT_NOT_FOUND_ON_CHAIN',
      productSnapshot.exists()
        ? `Serial ${serialId} exists in Firebase but is not registered in the active ProductRegistry contract.`
        : `Serial ${serialId} is not registered. Register the product before creating a transfer.`
    );
  }

  if (['RECALLED', 'INVALID', 'ARCHIVED', 'ADMINISTERED'].includes(String(productData?.status || '').toUpperCase()) || productData?.archivedAt) {
    throw httpError(400, 'PRODUCT_NOT_ACTIVE_INVENTORY', `Serial ${serialId} không còn là inventory hợp lệ. Không thể tạo lệnh chuyển giao.`);
  }

  if (['OWNER_MISMATCH', 'STATUS_MISMATCH', 'STALE_PENDING'].includes(String(productData?.syncStatus || '').toUpperCase())) {
    throw httpError(409, 'PRODUCT_SYNC_MISMATCH', `Serial ${serialId} đang lệch Firebase/on-chain. Reconcile trước khi chuyển giao.`);
  }

  const senderAddress = contractClient.getRoleAddress(fromRole);
  const [currentOwner, statusBefore, onChainPending] = await Promise.all([
    contractClient.getCurrentOwner(serialHash),
    contractClient.getProductStatus(serialHash),
    contractClient.getPendingTransfer(serialHash),
  ]);

  if (onChainPending.exists) {
    throw httpError(409, 'PENDING_TRANSFER_EXISTS_ON_CHAIN', `Serial ${serialId} already has a pending on-chain transfer.`);
  }

  if (!sameHex(currentOwner, senderAddress)) {
    throw httpError(409, 'NOT_CURRENT_OWNER_ON_CHAIN', `Role ${fromRole} cannot transfer ${serialId} because its signer ${senderAddress} is not the current on-chain owner ${currentOwner}.`);
  }

  if (!canCreateOnChainTransfer(Number(statusBefore))) {
    throw httpError(409, 'PRODUCT_STATUS_NOT_TRANSFERABLE', `Product ${serialId} cannot be transferred from current on-chain status ${productRegistryStatusToProductStatus(Number(statusBefore))}.`);
  }

  const fromLoc = toBytes32(fromLocationHash || (fromLocation ? `location:${fromLocation}` : `from:${senderAddress}`));
  const toLoc = toBytes32(toLocationHash || `to:${receiverAddress}`);
  const transferMetadata = buildTransferMetadata(req.body);

  const now = Date.now();
  const transferId = `${serialHash}_${now}`;
  const job = await txQueue.enqueue({
    type: 'CREATE_TRANSFER',
    payload: {
      serialId: serialHash,
      receiver: receiverAddress,
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      signerRole: fromRole,
    },
    metadata: {
      serialId,
      serialHash,
      transferId,
      ...(groupId ? { batchTransferGroupId: groupId } : {}),
    },
  });

  const txHash = job.txHash;
  const ipfsResult = await ipfsService.pinJson(`transfer-${serialId}-${now}`, {
    serialId,
    serialHash,
    sender: senderAddress,
    receiver: receiverAddress,
    fromRole,
    toRole,
    fromLocationHash: fromLoc,
    toLocationHash: toLoc,
    ...transferMetadata,
    status: 'PENDING',
    blockchainTx: txHash,
    batchTransferGroupId: groupId,
    createdAt: now,
  });

  const transfer: TransferRecord & { blockchainTx?: string; batchTransferGroupId?: string } = pruneUndefined({
    id: transferId,
    serialId,
    batchId: req.body.batchId || productData?.batchId || '',
    fromAddress: senderAddress,
    toAddress: receiverAddress,
    fromRole,
    toRole,
    status: 'PENDING',
    fromLocationHash: fromLoc,
    toLocationHash: toLoc,
    ...transferMetadata,
    ...(groupId ? { batchTransferGroupId: groupId } : {}),
    ipfsCid: ipfsResult?.cid,
    blockchainTx: txHash,
    createdAt: now,
    updatedAt: now,
  }) as TransferRecord & { blockchainTx?: string; batchTransferGroupId?: string };

  await Promise.all([
    db.ref(`transfers/${transferId}`).set(transfer),
    db.ref(`products/${serialHash}`).update({
      status: 'IN_TRANSIT',
      currentOwner: senderAddress,
      ownerRole: fromRole,
      latestTransferId: transferId,
      syncStatus: 'OK',
      updatedAt: now,
    }),
    db.ref(`pending-transfers/${serialHash}`).set(transferId),
  ]);

  return { transfer, serialHash, jobId: job.id };
}

/**
 * GET /transfers
 * List all transfer records from Firebase
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const visibility = getVisibilityContext(req);
    const snapshot = await db.ref('transfers').once('value');
    const data = snapshot.val() || {};
    let transfers = (Object.values(data) as TransferRecord[])
      .filter((transfer) => transferVisibleTo(transfer, visibility))
      .map((transfer) => decorateTransfer(transfer, visibility));

    transfers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ success: true, data: transfers });
  } catch (error) {
    Logger.error('Get transfers error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_TRANSFERS_ERROR', message: 'Failed to fetch transfers' },
    });
  }
});

/**
 * GET /transfers/:transferId
 * Get single transfer by ID
 */
router.get('/:transferId', validateRequest({ params: transferIdParamsSchema }), async (req: Request, res: Response) => {
  try {
    const { transferId } = req.params;
    const visibility = getVisibilityContext(req);
    const snapshot = await db.ref(`transfers/${transferId}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'TRANSFER_NOT_FOUND', message: `Transfer ${transferId} not found` },
      });
    }

    const transfer = snapshot.val();
    if (!transferVisibleTo(transfer, visibility)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view transfers related to your role or wallet.' },
        timestamp: Date.now(),
      });
    }

    res.json({ success: true, data: decorateTransfer(transfer, visibility) });
  } catch (error) {
    Logger.error('Get transfer error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_TRANSFER_ERROR', message: 'Failed to fetch transfer' },
    });
  }
});

/**
 * POST /transfers/scan
 * Create transfer request (Scan QR to initiate delivery)
 */
router.post(
  '/bulk-scan',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'ADMIN']),
  validateRequest({ body: transferBulkScanSchema }),
  async (req: AuthRequest, res: Response) => {
    const { serialIds } = req.body;
    const uniqueSerialIds: string[] = Array.from(new Set<string>((serialIds || []).map((value: string) => value.trim()).filter(Boolean)));
    const batchTransferGroupId = `bulk-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const successful: any[] = [];
    const failed: any[] = [];

    for (const serialId of uniqueSerialIds) {
      try {
        const result = await createTransferForSerial(req, serialId, batchTransferGroupId);
        successful.push({ serialId, ...result });
      } catch (error: any) {
        failed.push({
          serialId,
          code: error?.code || 'TRANSFER_SCAN_ERROR',
          message: getErrorMessage(error, 'Failed to create transfer'),
        });
      }
    }

    res.status(failed.length > 0 ? 207 : 200).json({
      success: failed.length === 0,
      data: {
        batchTransferGroupId,
        total: uniqueSerialIds.length,
        successful,
        failed,
      },
    });
  }
);

function batchMatches(batch: any, key: string) {
  const normalized = String(key || '').trim().toLowerCase();
  return batchIdentityValues(batch)
    .some((value) => String(value).trim().toLowerCase() === normalized);
}

function batchIdentityValues(batch: any) {
  return [batch?.id, batch?.batchHash, batch?.batchQR]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function productBatchValues(product: any) {
  return [product?.batchId, product?.batchHash]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function isBatchLikeSerial(serialId: unknown, batchValues: string[]) {
  const normalized = String(serialId || '').trim().toLowerCase();
  if (!normalized) return true;
  if (/^batch[-_:]/i.test(normalized)) return true;
  return batchValues.some((value) => value.toLowerCase() === normalized);
}

async function findBatchById(batchId: string): Promise<[string, any] | null> {
  const direct = await db.ref(`batches/${batchId}`).once('value');
  if (direct.exists()) return [batchId, direct.val()];

  const snapshot = await db.ref('batches').once('value');
  const entries = Object.entries(snapshot.val() || {}) as Array<[string, any]>;
  return entries.find(([, batch]) => batchMatches(batch, batchId)) || null;
}

router.post(
  '/batch-shell',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'ADMIN', 'RECALL_AUTHORITY']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { batchId, fromRole, toRole, receiverAddress: rawReceiverAddress } = req.body || {};
      if (!batchId || !fromRole || !toRole) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'Missing required fields: batchId, fromRole, toRole' },
        });
      }
      if (!canActAsRole(req, fromRole)) {
        return res.status(403).json({
          success: false,
          error: { code: 'ROLE_MISMATCH', message: `Only ${fromRole} can create this batch custody transfer` },
        });
      }
      if (!isAllowedTransferRoute(fromRole, toRole)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TRANSFER_ROUTE', message: `Route ${fromRole} -> ${toRole} is not allowed` },
        });
      }

      const found = await findBatchById(String(batchId));
      if (!found) {
        return res.status(404).json({
          success: false,
          error: { code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` },
        });
      }
      const [batchKey, batch] = found;
      if (batch?.archivedAt || ['ARCHIVED', 'INVALID', 'RECALLED'].includes(String(batch?.status || '').toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: { code: 'BATCH_NOT_ACTIVE', message: `Batch ${batchId} is not active inventory` },
        });
      }

      const productsSnapshot = await db.ref('products').once('value');
      const batchValues = Array.from(new Set([batchKey, ...batchIdentityValues(batch)]));
      const normalizedBatchValues = batchValues.map((item) => item.toLowerCase());
      const serialsInBatch = (Object.values(productsSnapshot.val() || {}) as any[]).filter((product) => {
        if (product?.archivedAt || ['ARCHIVED', 'INVALID', 'RECALLED'].includes(String(product?.status || '').toUpperCase())) return false;
        if (isBatchLikeSerial(product?.serialId, batchValues)) return false;
        return productBatchValues(product)
          .map((value) => value.toLowerCase())
          .some((value) => normalizedBatchValues.includes(value));
      });
      if (serialsInBatch.length > 0) {
        return res.status(409).json({
          success: false,
          error: { code: 'BATCH_HAS_SERIALS', message: 'Batch has serials. Use bulk serial transfer instead.' },
        });
      }

      const senderAddress = contractClient.getRoleAddress(fromRole);
      const receiverAddress = rawReceiverAddress || contractClient.getRoleAddress(toRole);
      if (!CryptoUtils.isValidAddress(receiverAddress)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_RECEIVER', message: 'receiverAddress must be a valid Ethereum address' },
        });
      }

      const now = Date.now();
      const transferId = `batch-${toBytes32(String(batch?.batchHash || batch?.id || batchId))}_${now}`;
      const transfer = pruneUndefined({
        id: transferId,
        serialId: '',
        batchId: batch?.id || String(batchId),
        batchHash: batch?.batchHash || batchKey,
        fromAddress: senderAddress,
        toAddress: receiverAddress,
        fromRole,
        toRole,
        status: 'PENDING',
        mode: 'OFF_CHAIN_BATCH_CUSTODY',
        transferMode: 'OFF_CHAIN_BATCH_CUSTODY',
        offChainOnly: true,
        reasonNote: 'Batch has no serials; no on-chain serial transfer was created',
        createdAt: now,
        updatedAt: now,
      });

      await Promise.all([
        db.ref(`transfers/${transferId}`).set(transfer),
        db.ref(`batch-transfers/${transferId}`).set(transfer),
        db.ref(`batches/${batchKey}`).update({
          pendingBatchTransferId: transferId,
          custodyStatus: 'PENDING_TRANSFER',
          updatedAt: now,
        }),
      ]);

      res.json({ success: true, data: { transfer, transferId } });
    } catch (error) {
      Logger.error('Create batch shell transfer error', error);
      res.status(500).json({
        success: false,
        error: { code: 'BATCH_SHELL_TRANSFER_ERROR', message: getErrorMessage(error, 'Failed to create batch custody transfer') },
      });
    }
  }
);

router.post(
  '/scan',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'ADMIN']),
  validateRequest({ body: transferScanSchema }),
  async (req: AuthRequest, res: Response) => {
  try {
    const data = await createTransferForSerial(req, req.body.serialId);
    return res.json({
      success: true,
      data,
    });

    const {
      serialId,
      receiverAddress: rawReceiverAddress,
      fromRole,
      toRole,
      fromLocationHash,
      toLocationHash,
      fromLocation,
    } = req.body;

    if (!serialId || !fromRole || !toRole) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, fromRole, toRole',
        },
      });
    }

    if (!SAFE_ID_PATTERN.test(serialId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SERIAL_ID',
          message: 'Serial chá»‰ Ä‘Æ°á»£c dÃ¹ng chá»¯, sá»‘, dáº¥u gáº¡ch ngang hoáº·c gáº¡ch dÆ°á»›i.',
        },
      });
    }

    if (req.user?.role !== 'ADMIN' && req.user?.role !== fromRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_MISMATCH',
          message: `Only ${fromRole} can create this transfer`,
        },
      });
    }

    if (!isAllowedTransferRoute(fromRole, toRole)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TRANSFER_ROUTE',
          message: `Route ${fromRole} -> ${toRole} is not allowed by the supply-chain route matrix`,
        },
      });
    }

    const receiverAddress = rawReceiverAddress || contractClient.getRoleAddress(toRole);

    if (!CryptoUtils.isValidAddress(receiverAddress)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RECEIVER',
          message: 'receiverAddress must be a valid Ethereum address',
        },
      });
    }

    Logger.info(`Transfer scan for: ${serialId}`);

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
    const existsOnChain = await contractClient.productExists(serialHash);
    if (!existsOnChain) {
      const productSnapshot = await db.ref(`products/${serialHash}`).once('value');
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND_ON_CHAIN',
          message: productSnapshot.exists()
            ? `Serial ${serialId} exists in Firebase but is not registered in the active ProductRegistry contract. Register it again on the current network/contracts before creating a transfer.`
            : `Serial ${serialId} is not registered. Register the product before creating a transfer.`,
        },
        timestamp: Date.now(),
      });
    }

    const productSnapshot = await db.ref(`products/${serialHash}`).once('value');
    if (productSnapshot.exists()) {
      const productData = productSnapshot.val();
      if (productData.status === 'RECALLED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PRODUCT_RECALLED',
            message: `Serial ${serialId} thuá»™c lÃ´ Ä‘Ã£ bá»‹ thu há»“i. KhÃ´ng thá»ƒ táº¡o lá»‡nh chuyá»ƒn giao.`,
          },
          timestamp: Date.now(),
        });
      }
    }

    const senderAddress = contractClient.getRoleAddress(fromRole);
    const [currentOwner, statusBefore, onChainPending] = await Promise.all([
      contractClient.getCurrentOwner(serialHash),
      contractClient.getProductStatus(serialHash),
      contractClient.getPendingTransfer(serialHash),
    ]);

    if (onChainPending.exists) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PENDING_TRANSFER_EXISTS_ON_CHAIN',
          message: `Serial ${serialId} already has a pending on-chain transfer. Confirm or reject that transfer before creating a new one.`,
        },
        timestamp: Date.now(),
      });
    }

    if (!sameHex(currentOwner, senderAddress)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'NOT_CURRENT_OWNER_ON_CHAIN',
          message: `Role ${fromRole} cannot transfer ${serialId} because its signer ${senderAddress} is not the current on-chain owner ${currentOwner}. Log in with the current owner role/wallet or sync product ownership first.`,
        },
        timestamp: Date.now(),
      });
    }

    if (!canCreateOnChainTransfer(Number(statusBefore))) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PRODUCT_STATUS_NOT_TRANSFERABLE',
          message: `Product ${serialId} cannot be transferred from current on-chain status ${productRegistryStatusToProductStatus(Number(statusBefore))}.`,
        },
        timestamp: Date.now(),
      });
    }

    const fromLoc = toBytes32(fromLocationHash || (fromLocation ? `location:${fromLocation}` : `from:${senderAddress}`));
    const toLoc = toBytes32(toLocationHash || `to:${receiverAddress}`);
    const transferMetadata = buildTransferMetadata(req.body);

    const job = await txQueue.enqueue({
      type: 'CREATE_TRANSFER',
      payload: {
        serialId: serialHash,
        receiver: receiverAddress,
        fromLocationHash: fromLoc,
        toLocationHash: toLoc,
        signerRole: fromRole,
      },
      metadata: {
        serialId,
        serialHash,
        transferId: `${serialHash}_${Date.now()}`,
      },
    });

    const now = Date.now();
    const txHash = job.txHash;
    const transferId = `${serialHash}_${now}`;
    const ipfsResult = await ipfsService.pinJson(`transfer-${serialId}-${now}`, {
      serialId,
      serialHash,
      sender: senderAddress,
      receiver: receiverAddress,
      fromRole,
      toRole,
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      ...transferMetadata,
      status: 'PENDING',
      blockchainTx: txHash,
      createdAt: now,
    });

    const transfer: TransferRecord & { blockchainTx?: string } = {
      id: transferId,
      serialId,
      batchId: req.body.batchId || '',
      fromAddress: senderAddress,
      toAddress: receiverAddress,
      fromRole,
      toRole,
      status: 'PENDING',
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      ...transferMetadata,
      ipfsCid: ipfsResult?.cid,
      blockchainTx: txHash,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`transfers/${transferId}`).set(transfer),
      db.ref(`products/${serialHash}`).update({
        status: 'IN_TRANSIT',
        currentOwner: senderAddress,
        ownerRole: fromRole,
        updatedAt: now,
      }),
      db.ref(`pending-transfers/${serialHash}`).set(transferId),
    ]);

    res.json({
      success: true,
      data: {
        transfer,
        serialHash,
        jobId: job.id,
      },
    });
  } catch (error) {
    Logger.error('Transfer scan error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_SCAN_ERROR',
        message: getErrorMessage(error, 'Failed to create transfer'),
      },
    });
  }
  }
);

router.post(
  '/sync-wallet-create',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'ADMIN']),
  validateRequest({ body: transferScanSchema.extend({ txHash: txHashSchema }) }),
  async (req: AuthRequest, res: Response) => {
  try {
    const { txHash, serialId, fromRole, toRole, receiverAddress, batchId = '', fromLocationHash, toLocationHash } = req.body;

    if (!txHash || !serialId || !fromRole || !toRole || !receiverAddress) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Missing txHash, serialId, fromRole, toRole, or receiverAddress' },
      });
    }

    if (req.user?.role !== 'ADMIN' && req.user?.role !== fromRole) {
      return res.status(403).json({
        success: false,
        error: { code: 'ROLE_MISMATCH', message: `Only ${fromRole} can create this transfer` },
      });
    }

    if (!isAllowedTransferRoute(fromRole, toRole)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TRANSFER_ROUTE',
          message: `Route ${fromRole} -> ${toRole} is not allowed by the supply-chain route matrix`,
        },
      });
    }

    const serialHash = toBytes32(serialId);
    const receipt = await requireSuccessfulTx(txHash, contractClient.transferLedger?.target as string);
    const event = requireReceiptEvent(receipt, 'TransferRequested');
    const eventSender = String(event.args.sender);
    const eventReceiver = String(event.args.receiver);
    const expectedSender = req.user?.address || eventSender;

    if (!sameHex(String(event.args.serialID), serialHash)) {
      throw httpError(400, 'TX_SERIAL_MISMATCH', 'Transaction serial does not match request payload');
    }

    if (!sameHex(eventReceiver, receiverAddress)) {
      throw httpError(400, 'TX_RECEIVER_MISMATCH', 'Transaction receiver does not match request payload');
    }

    if (req.user?.role !== 'ADMIN' && normalizeAddress(eventSender) !== normalizeAddress(expectedSender)) {
      throw httpError(403, 'TX_SENDER_MISMATCH', 'Transaction sender does not match the authenticated wallet');
    }

    const senderAddress = eventSender;
    const fromLoc = toBytes32(fromLocationHash || `from:${senderAddress}`);
    const toLoc = toBytes32(toLocationHash || `to:${receiverAddress}`);
    const transferMetadata = buildTransferMetadata(req.body);

    if (!sameHex(String(event.args.fromLocationHash), fromLoc) || !sameHex(String(event.args.toLocationHash), toLoc)) {
      throw httpError(400, 'TX_LOCATION_MISMATCH', 'Transaction location hashes do not match request payload');
    }

    const now = Date.now();
    const transferId = `${serialHash}_${now}`;
    const ipfsResult = await ipfsService.pinJson(`wallet-transfer-${serialId}-${now}`, {
      serialId,
      serialHash,
      sender: senderAddress,
      receiver: receiverAddress,
      fromRole,
      toRole,
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      ...transferMetadata,
      status: 'PENDING',
      blockchainTx: txHash,
      createdAt: now,
    });

    const transfer: TransferRecord & { blockchainTx?: string } = {
      id: transferId,
      serialId,
      batchId,
      fromAddress: senderAddress,
      toAddress: receiverAddress,
      fromRole,
      toRole,
      status: 'PENDING',
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      ...transferMetadata,
      ipfsCid: ipfsResult?.cid,
      blockchainTx: txHash,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`transfers/${transferId}`).set(transfer),
      db.ref(`products/${serialHash}`).update({
        status: 'IN_TRANSIT',
        currentOwner: senderAddress,
        ownerRole: fromRole,
        updatedAt: now,
      }),
      db.ref(`pending-transfers/${serialHash}`).set(transferId),
    ]);

    res.json({ success: true, data: { transfer, serialHash, txHash } });
  } catch (error: any) {
    Logger.error('Sync wallet transfer create error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'WALLET_TRANSFER_SYNC_ERROR', message: error.message || 'Failed to sync wallet transfer' },
      timestamp: Date.now(),
    });
  }
  }
);

router.post('/:transferId/confirm-batch-shell', verifyToken, requireRole(transferReceiverActionRoles), async (req: AuthRequest, res: Response) => {
  try {
    const { transferId } = req.params;
    const snapshot = await db.ref(`transfers/${transferId}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, error: { code: 'TRANSFER_NOT_FOUND', message: `Transfer ${transferId} not found` } });
    }
    const transfer = snapshot.val();
    if (transfer.mode !== 'OFF_CHAIN_BATCH_CUSTODY' && transfer.transferMode !== 'OFF_CHAIN_BATCH_CUSTODY') {
      return res.status(400).json({ success: false, error: { code: 'NOT_BATCH_SHELL_TRANSFER', message: 'Transfer is not an off-chain batch custody transfer' } });
    }
    if (transfer.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: { code: 'TRANSFER_NOT_PENDING', message: 'Transfer is not pending' } });
    }
    if (!canActAsRole(req, transfer.toRole)) {
      return res.status(403).json({ success: false, error: { code: 'ROLE_MISMATCH', message: `Only ${transfer.toRole} can confirm this transfer` } });
    }

    const found = await findBatchById(transfer.batchHash || transfer.batchId);
    const batchKey = found?.[0] || transfer.batchHash || transfer.batchId;
    const now = Date.now();
    const updates: Record<string, unknown> = {
      [`transfers/${transferId}/status`]: 'CONFIRMED',
      [`transfers/${transferId}/confirmedAt`]: now,
      [`transfers/${transferId}/updatedAt`]: now,
      [`batch-transfers/${transferId}/status`]: 'CONFIRMED',
      [`batch-transfers/${transferId}/confirmedAt`]: now,
      [`batch-transfers/${transferId}/updatedAt`]: now,
      [`batches/${batchKey}/currentOwner`]: transfer.toAddress,
      [`batches/${batchKey}/ownerRole`]: transfer.toRole,
      [`batches/${batchKey}/latestTransferId`]: transferId,
      [`batches/${batchKey}/pendingBatchTransferId`]: null,
      [`batches/${batchKey}/custodyStatus`]: 'CONFIRMED',
      [`batches/${batchKey}/updatedAt`]: now,
    };
    await db.ref().update(updates);
    res.json({ success: true, data: { ...transfer, status: 'CONFIRMED', confirmedAt: now, updatedAt: now } });
  } catch (error) {
    Logger.error('Confirm batch shell transfer error', error);
    res.status(500).json({ success: false, error: { code: 'BATCH_SHELL_CONFIRM_ERROR', message: getErrorMessage(error, 'Failed to confirm batch custody transfer') } });
  }
});

router.post('/:transferId/reject-batch-shell', verifyToken, requireRole(transferReceiverActionRoles), async (req: AuthRequest, res: Response) => {
  try {
    const { transferId } = req.params;
    const { rejectionReason = '' } = req.body || {};
    const snapshot = await db.ref(`transfers/${transferId}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, error: { code: 'TRANSFER_NOT_FOUND', message: `Transfer ${transferId} not found` } });
    }
    const transfer = snapshot.val();
    if (transfer.mode !== 'OFF_CHAIN_BATCH_CUSTODY' && transfer.transferMode !== 'OFF_CHAIN_BATCH_CUSTODY') {
      return res.status(400).json({ success: false, error: { code: 'NOT_BATCH_SHELL_TRANSFER', message: 'Transfer is not an off-chain batch custody transfer' } });
    }
    if (transfer.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: { code: 'TRANSFER_NOT_PENDING', message: 'Transfer is not pending' } });
    }
    if (!canActAsRole(req, transfer.toRole)) {
      return res.status(403).json({ success: false, error: { code: 'ROLE_MISMATCH', message: `Only ${transfer.toRole} can reject this transfer` } });
    }

    const found = await findBatchById(transfer.batchHash || transfer.batchId);
    const batchKey = found?.[0] || transfer.batchHash || transfer.batchId;
    const now = Date.now();
    const updates: Record<string, unknown> = {
      [`transfers/${transferId}/status`]: 'REJECTED',
      [`transfers/${transferId}/rejectedReason`]: String(rejectionReason || '').trim(),
      [`transfers/${transferId}/rejectedAt`]: now,
      [`transfers/${transferId}/updatedAt`]: now,
      [`batch-transfers/${transferId}/status`]: 'REJECTED',
      [`batch-transfers/${transferId}/rejectedReason`]: String(rejectionReason || '').trim(),
      [`batch-transfers/${transferId}/rejectedAt`]: now,
      [`batch-transfers/${transferId}/updatedAt`]: now,
      [`batches/${batchKey}/pendingBatchTransferId`]: null,
      [`batches/${batchKey}/custodyStatus`]: 'REJECTED',
      [`batches/${batchKey}/updatedAt`]: now,
    };
    await db.ref().update(updates);
    res.json({ success: true, data: { ...transfer, status: 'REJECTED', rejectedReason: String(rejectionReason || '').trim(), rejectedAt: now, updatedAt: now } });
  } catch (error) {
    Logger.error('Reject batch shell transfer error', error);
    res.status(500).json({ success: false, error: { code: 'BATCH_SHELL_REJECT_ERROR', message: getErrorMessage(error, 'Failed to reject batch custody transfer') } });
  }
});

/**
 * POST /transfers/confirm
 * Confirm transfer (Receiver accepts delivery)
 */
router.post(
  '/confirm',
  verifyToken,
  requireRole(transferReceiverActionRoles),
  validateRequest({ body: transferConfirmSchema }),
  async (req: AuthRequest, res: Response) => {
  try {
    const { serialId, receiverLocationHash } = req.body;

    if (!serialId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required field: serialId',
        },
      });
    }

    Logger.info(`Transfer confirm for: ${serialId}`);

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
    const pendingEntry = await resolvePendingTransfer(serialId, serialHash);

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PENDING_TRANSFER_NOT_FOUND',
          message: `No pending transfer found for ${serialId}`,
        },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry;
    if (!authenticatedUserHasRole(req, 'ADMIN') && !authenticatedUserHasRole(req, pendingTransfer.toRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_MISMATCH',
          message: `Only ${pendingTransfer.toRole} can confirm this transfer`,
        },
      });
    }

    const locationHash = toBytes32(receiverLocationHash || pendingTransfer.toLocationHash);

    const job = await txQueue.enqueue({
      type: 'CONFIRM_TRANSFER',
      payload: {
        serialId: serialHash,
        receiverLocationHash: locationHash,
        signerRole: pendingTransfer.toRole,
        expectedReceiver: pendingTransfer.toAddress,
      },
      metadata: {
        serialId,
        serialHash,
        transferId,
      },
    });

    const now = Date.now();

    await db.ref(`transfers/${transferId}`).update({
      updatedAt: now,
    });

    res.json({
      success: true,
      data: {
        transferId,
        serialId,
        serialHash,
        jobId: job.id,
      },
    });
  } catch (error) {
    Logger.error('Transfer confirm error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_CONFIRM_ERROR',
        message: getErrorMessage(error, 'Failed to confirm transfer'),
      },
    });
  }
  }
);

router.post(
  '/sync-wallet-confirm',
  verifyToken,
  requireRole(transferReceiverActionRoles),
  validateRequest({ body: transferConfirmSchema.extend({ txHash: txHashSchema }) }),
  async (req: AuthRequest, res: Response) => {
  try {
    const { serialId, txHash } = req.body;
    if (!serialId || !txHash) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Missing serialId or txHash' },
      });
    }
    const serialHash = toBytes32(serialId);
    const pendingEntry = await resolvePendingTransfer(serialId, serialHash);

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: { code: 'PENDING_TRANSFER_NOT_FOUND', message: `No pending transfer found for ${serialId}` },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry;
    if (!authenticatedUserHasRole(req, 'ADMIN') && !authenticatedUserHasRole(req, pendingTransfer.toRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ROLE_MISMATCH', message: `Only ${pendingTransfer.toRole} can confirm this transfer` },
      });
    }

    const receipt = await requireSuccessfulTx(txHash, contractClient.transferLedger?.target as string);
    const event = requireReceiptEvent(receipt, 'TransferConfirmed');

    if (!sameHex(String(event.args.serialID), serialHash)) {
      throw httpError(400, 'TX_SERIAL_MISMATCH', 'Transaction serial does not match request payload');
    }

    if (!sameHex(String(event.args.receiver), pendingTransfer.toAddress)) {
      throw httpError(400, 'TX_RECEIVER_MISMATCH', 'Transaction receiver does not match the pending transfer');
    }

    if (req.user?.role !== 'ADMIN' && normalizeAddress(req.user?.address) !== normalizeAddress(pendingTransfer.toAddress)) {
      throw httpError(403, 'TX_SENDER_MISMATCH', 'Authenticated wallet cannot sync this receiver transaction');
    }

    const now = Date.now();
    const deliveredStatus = getDeliveredStatus(pendingTransfer.toRole);
    await Promise.all([
      db.ref(`transfers/${transferId}`).update({
        status: 'CONFIRMED',
        confirmedAt: now,
        blockchainTx: txHash,
        updatedAt: now,
      }),
      db.ref(`products/${serialHash}`).update({
        status: deliveredStatus,
        currentOwner: pendingTransfer.toAddress,
        ownerRole: pendingTransfer.toRole,
        updatedAt: now,
      }),
      db.ref(`pending-transfers/${serialHash}`).remove(),
    ]);

    res.json({ success: true, data: { transferId, serialId, serialHash, txHash } });
  } catch (error: any) {
    Logger.error('Sync wallet transfer confirm error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'WALLET_TRANSFER_CONFIRM_SYNC_ERROR', message: error.message || 'Failed to sync wallet confirm' },
      timestamp: Date.now(),
    });
  }
  }
);

/**
 * POST /transfers/reject
 * Reject transfer â€” reverts product status on-chain via rejectTransfer()
 */
router.post(
  '/reject',
  verifyToken,
  requireRole(transferReceiverActionRoles),
  validateRequest({ body: transferRejectSchema }),
  async (req: AuthRequest, res: Response) => {
  try {
    const { serialId, rejectionReason } = req.body;

    if (!serialId || !rejectionReason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, rejectionReason',
        },
      });
    }

    Logger.info(`Transfer reject for: ${serialId}`);

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
    const pendingEntry = await resolvePendingTransfer(serialId, serialHash);

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PENDING_TRANSFER_NOT_FOUND',
          message: `No pending transfer found for ${serialId}`,
        },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry;

    if (!authenticatedUserHasRole(req, 'ADMIN') && !authenticatedUserHasRole(req, pendingTransfer.toRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_MISMATCH',
          message: `Only ${pendingTransfer.toRole} can reject this transfer`,
        },
      });
    }

    const onChainPending = await contractClient.getPendingTransfer(serialHash);
    if (!onChainPending.exists) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ON_CHAIN_PENDING_TRANSFER_NOT_FOUND',
          message: `Firebase still has a pending transfer for ${serialId}, but the active TransferLedger contract does not. Recreate the transfer on the current contract or clear the stale Firebase transfer.`,
        },
      });
    }

    if (onChainPending.receiver.toLowerCase() !== pendingTransfer.toAddress.toLowerCase()) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'TRANSFER_RECEIVER_MISMATCH',
          message: `Firebase receiver ${pendingTransfer.toAddress} does not match on-chain receiver ${onChainPending.receiver}. Refresh transfer data before rejecting.`,
        },
      });
    }

    const statusBefore = await contractClient.getProductStatus(serialHash);
    if (Number(statusBefore) !== 2) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_IN_TRANSIT_ON_CHAIN',
          message: `Product ${serialId} is not IN_TRANSIT on the active ProductRegistry contract. Current on-chain status: ${productRegistryStatusToProductStatus(Number(statusBefore))}.`,
        },
      });
    }

    // Receiver address must sign the rejection.
    const job = await txQueue.enqueue({
      type: 'REJECT_TRANSFER',
      payload: {
        serialId: serialHash,
        reason: rejectionReason,
        signerRole: pendingTransfer.toRole,
        expectedReceiver: pendingTransfer.toAddress,
      },
      metadata: {
        serialId,
        serialHash,
        transferId,
      },
    });

    const now = Date.now();

    await db.ref(`transfers/${transferId}`).update({
      updatedAt: now,
    });

    res.json({
      success: true,
      data: {
        transferId,
        serialId,
        serialHash,
        rejectionReason,
        jobId: job.id,
      },
    });
  } catch (error) {
    Logger.error('Transfer reject error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_REJECT_ERROR',
        message: getErrorMessage(error, 'Failed to reject transfer'),
      },
    });
  }
  }
);

router.post(
  '/sync-wallet-reject',
  verifyToken,
  requireRole(transferReceiverActionRoles),
  validateRequest({ body: transferRejectSchema.extend({ txHash: txHashSchema }) }),
  async (req: AuthRequest, res: Response) => {
  try {
    const { serialId, rejectionReason, txHash } = req.body;
    if (!serialId || !rejectionReason || !txHash) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Missing serialId, rejectionReason, or txHash' },
      });
    }
    const serialHash = toBytes32(serialId);
    const pendingEntry = await resolvePendingTransfer(serialId, serialHash);

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: { code: 'PENDING_TRANSFER_NOT_FOUND', message: `No pending transfer found for ${serialId}` },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry;
    if (!authenticatedUserHasRole(req, 'ADMIN') && !authenticatedUserHasRole(req, pendingTransfer.toRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ROLE_MISMATCH', message: `Only ${pendingTransfer.toRole} can reject this transfer` },
      });
    }

    const receipt = await requireSuccessfulTx(txHash, contractClient.transferLedger?.target as string);
    const event = requireReceiptEvent(receipt, 'TransferRejected');
    const reasonHash = toBytes32(rejectionReason);

    if (!authenticatedUserHasRole(req, 'ADMIN') && !sameHex(receipt.from, pendingTransfer.toAddress)) {
      throw httpError(403, 'TX_SENDER_MISMATCH', 'Transaction was not signed by the pending transfer receiver');
    }

    if (!sameHex(String(event.args.serialID), serialHash)) {
      throw httpError(400, 'TX_SERIAL_MISMATCH', 'Transaction serial does not match request payload');
    }

    if (!sameHex(String(event.args.receiver), pendingTransfer.toAddress)) {
      throw httpError(400, 'TX_RECEIVER_MISMATCH', 'Transaction receiver does not match the pending transfer');
    }

    if (!sameHex(String(event.args.reason), reasonHash)) {
      throw httpError(400, 'TX_REASON_MISMATCH', 'Transaction rejection reason does not match request payload');
    }

    if (!authenticatedUserHasRole(req, 'ADMIN') && normalizeAddress(req.user?.address) !== normalizeAddress(pendingTransfer.toAddress)) {
      throw httpError(403, 'TX_SENDER_MISMATCH', 'Authenticated wallet cannot sync this receiver transaction');
    }

    const statusAfter = await contractClient.getProductStatus(serialHash);
    const now = Date.now();
    await Promise.all([
      db.ref(`transfers/${transferId}`).update({
        status: 'REJECTED',
        rejectedReason: rejectionReason,
        rejectedAt: now,
        blockchainTx: txHash,
        updatedAt: now,
      }),
      db.ref(`products/${serialHash}`).update({
        status: productRegistryStatusToProductStatus(Number(statusAfter)),
        currentOwner: pendingTransfer.fromAddress,
        ownerRole: pendingTransfer.fromRole,
        updatedAt: now,
      }),
      db.ref(`pending-transfers/${serialHash}`).remove(),
    ]);

    res.json({ success: true, data: { transferId, serialId, serialHash, rejectionReason, txHash } });
  } catch (error: any) {
    Logger.error('Sync wallet transfer reject error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'WALLET_TRANSFER_REJECT_SYNC_ERROR', message: error.message || 'Failed to sync wallet reject' },
      timestamp: Date.now(),
    });
  }
  }
);

/**
 * POST /transfers/:transferId/clear-stale
 * Admin: clear a stale Firebase transfer whose on-chain pending transfer no longer exists.
 * Resets product status to VERIFIED and restores ownership to the transfer's fromAddress.
 */
router.post(
  '/:transferId/clear-stale',
  verifyToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response) => {
  try {
    const { transferId } = req.params;
    if (!transferId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_TRANSFER_ID', message: 'transferId is required' } });
    }

    const snap = await db.ref(`transfers/${transferId}`).once('value');
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: { code: 'TRANSFER_NOT_FOUND', message: `Transfer ${transferId} not found in Firebase` } });
    }

    const transfer = snap.val() as TransferRecord;
    if (transfer.status !== 'PENDING') {
      return res.status(409).json({
        success: false,
        error: { code: 'TRANSFER_NOT_PENDING', message: `Transfer ${transferId} is ${transfer.status}, not PENDING. Only PENDING transfers can be cleared.` },
      });
    }

    const serialHash = toBytes32(transfer.serialId);
    const onChainPending = await contractClient.getPendingTransfer(serialHash);
    if (onChainPending.exists) {
      return res.status(409).json({
        success: false,
        error: { code: 'ON_CHAIN_PENDING_EXISTS', message: `Transfer ${transferId} still has an active on-chain pending transfer. Use reject endpoint instead.` },
      });
    }

    const now = Date.now();
    await Promise.all([
      db.ref(`transfers/${transferId}`).update({ status: 'REJECTED', rejectedReason: 'Cleared by admin: stale Firebase transfer (no on-chain counterpart)', rejectedAt: now, updatedAt: now }),
      db.ref(`products/${serialHash}`).update({ status: 'VERIFIED', currentOwner: transfer.fromAddress, ownerRole: transfer.fromRole, updatedAt: now }),
      db.ref(`pending-transfers/${serialHash}`).remove(),
    ]);

    res.json({ success: true, data: { transferId, serialId: transfer.serialId, restoredOwner: transfer.fromAddress, restoredRole: transfer.fromRole } });
  } catch (error: any) {
    Logger.error('Clear stale transfer error', error);
    res.status(500).json({ success: false, error: { code: 'CLEAR_STALE_ERROR', message: error.message || 'Failed to clear stale transfer' } });
  }
  }
);

export default router;

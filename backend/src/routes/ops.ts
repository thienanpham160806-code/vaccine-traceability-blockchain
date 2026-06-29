import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';
import {
  decorateProduct,
  getVisibilityContext,
  isAddressMatch,
  productVisibleTo,
  recallVisibleTo,
  riskVisibleTo,
} from '../services/visibility';

const router = Router();
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;
const productRegistryEvents = new ethers.Interface([
  'event BatchRecalled(bytes32 indexed batchHash, bytes32 indexed reasonHash, uint256 totalProducts)',
]);

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function sameHex(left?: string, right?: string): boolean {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
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
    return `${fallback}. Smart contract rejected the recall before returning a reason. Check that the signer has RECALL_AUTHORITY and that the batch exists on-chain and has not been recalled.`;
  }
  return raw;
}

async function loadDecoratedProductIndex() {
  const [productsSnapshot, transfersSnapshot] = await Promise.all([
    db.ref('products').once('value'),
    db.ref('transfers').once('value'),
  ]);
  const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
  const products = (Object.values(productsSnapshot.val() || {}) as any[])
    .map((product) => decorateProduct(product, transfers));
  const productBySerial = new Map<string, any>();

  products.forEach((product) => {
    if (product.serialId) productBySerial.set(String(product.serialId), product);
    if (product.serialHash) productBySerial.set(String(product.serialHash), product);
  });

  return { products, productBySerial };
}

function disputeVisibleTo(dispute: any, ctx: ReturnType<typeof getVisibilityContext>, productBySerial: Map<string, any>): boolean {
  if (isAdminAuthorityContext(ctx)) return true;
  if (!ctx.isAuthenticated) return false;
  if (isAddressMatch(dispute?.createdByAddress || dispute?.reportedByAddress, ctx.address)) return true;
  const targetId = String(dispute?.targetId || dispute?.relatedSerialId || '');
  const product = productBySerial.get(targetId);
  return product ? productVisibleTo(product, ctx) : false;
}

function isAdminAuthorityContext(ctx: ReturnType<typeof getVisibilityContext>) {
  return ctx.roles.includes('ADMIN') || ctx.roles.includes('RECALL_AUTHORITY');
}

function isAdminAuthorityRequest(req: AuthRequest | Request) {
  const user = (req as AuthRequest).user;
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  return roles.has('ADMIN') || roles.has('RECALL_AUTHORITY');
}

function normalizeTargetType(value: unknown): 'SERIAL' | 'BATCH' {
  return String(value || '').toUpperCase() === 'BATCH' ? 'BATCH' : 'SERIAL';
}

async function targetExists(targetType: 'SERIAL' | 'BATCH', targetId: string) {
  if (targetType === 'SERIAL') {
    const serialHash = toBytes32(targetId);
    const direct = await db.ref(`products/${serialHash}`).once('value');
    if (direct.exists()) return { exists: true, product: direct.val(), serialHash };
    const index = await db.ref(`serial-index/${targetId}`).once('value');
    const indexedKey = index.val();
    if (indexedKey) {
      const indexed = await db.ref(`products/${indexedKey}`).once('value');
      if (indexed.exists()) return { exists: true, product: indexed.val(), serialHash: indexedKey };
    }
    return { exists: false };
  }

  const direct = await db.ref(`batches/${targetId}`).once('value');
  if (direct.exists()) return { exists: true, batch: direct.val(), batchKey: targetId };
  const all = await db.ref('batches').once('value');
  const entry = (Object.entries(all.val() || {}) as Array<[string, any]>).find(([, batch]) =>
    [batch?.id, batch?.batchHash, batch?.batchQR]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase())
      .includes(targetId.toLowerCase())
  );
  return entry ? { exists: true, batch: entry[1], batchKey: entry[0] } : { exists: false };
}

function productStatusFromChain(status: number): string {
  const statuses = ['REGISTERED', 'VERIFIED', 'IN_TRANSIT', 'DELIVERED', 'FLAGGED', 'RECALLED'];
  return statuses[status] || 'UNKNOWN';
}

function roleFromOwnerAddress(address?: string): string | null {
  const normalized = String(address || '').toLowerCase();
  const roles = ['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY', 'RECALL_AUTHORITY'];
  for (const role of roles) {
    const roleAddress = contractClient.getRoleAddress(role);
    if (roleAddress && roleAddress.toLowerCase() === normalized) return role;
  }
  return null;
}

async function buildReconcilePreview() {
  if (!contractClient.isInitialized()) {
    const error: any = new Error('Smart contracts are not initialized');
    error.statusCode = 503;
    error.code = 'CONTRACTS_NOT_READY';
    throw error;
  }

  const [productsSnapshot, pendingSnapshot, transfersSnapshot] = await Promise.all([
    db.ref('products').once('value'),
    db.ref('pending-transfers').once('value'),
    db.ref('transfers').once('value'),
  ]);
  const pendingIndex = pendingSnapshot.val() || {};
  const transfers = transfersSnapshot.val() || {};
  const items: any[] = [];
  const summary: Record<string, number> = {
    OK: 0,
    FIREBASE_ONLY: 0,
    OWNER_MISMATCH: 0,
    STATUS_MISMATCH: 0,
    STALE_PENDING: 0,
  };

  for (const [productKey, product] of Object.entries(productsSnapshot.val() || {}) as Array<[string, any]>) {
    const serialId = product.serialId || productKey;
    const serialHash = CryptoUtils.isValidHash(productKey) ? productKey : toBytes32(serialId);
    const firebasePendingId = pendingIndex[serialHash] || pendingIndex[serialId] || product.latestTransferId || null;
    const firebasePending = firebasePendingId ? transfers[firebasePendingId] : null;
    const item: any = {
      productKey,
      serialId,
      serialHash,
      firebaseOwner: product.currentOwner || null,
      firebaseOwnerRole: product.ownerRole || null,
      firebaseStatus: product.status || null,
      firebasePendingTransferId: firebasePending?.status === 'PENDING' ? firebasePendingId : null,
      chainExists: false,
      chainOwner: null,
      chainOwnerRole: null,
      chainStatus: null,
      chainPendingExists: false,
      syncStatus: 'OK',
      problems: [],
    };

    const exists = await contractClient.productExists(serialHash);
    item.chainExists = exists;
    if (!exists) {
      item.syncStatus = 'FIREBASE_ONLY';
      item.problems.push('Product exists in Firebase but not on the active contract.');
      summary.FIREBASE_ONLY += 1;
      items.push(item);
      continue;
    }

    const [chainOwner, chainStatusRaw, chainPending] = await Promise.all([
      contractClient.getCurrentOwner(serialHash),
      contractClient.getProductStatus(serialHash),
      contractClient.getPendingTransfer(serialHash),
    ]);
    const chainStatus = productStatusFromChain(Number(chainStatusRaw));
    item.chainOwner = chainOwner;
    item.chainOwnerRole = roleFromOwnerAddress(chainOwner);
    item.chainStatus = chainStatus;
    item.chainPendingExists = Boolean(chainPending?.exists);

    if (item.firebasePendingTransferId && !item.chainPendingExists) {
      item.syncStatus = 'STALE_PENDING';
      item.problems.push('Firebase has a pending transfer, but the active contract has no pending transfer.');
    }
    if (product.currentOwner && String(product.currentOwner).toLowerCase() !== String(chainOwner).toLowerCase()) {
      item.syncStatus = 'OWNER_MISMATCH';
      item.problems.push('Firebase currentOwner differs from on-chain owner.');
    }
    if (product.status && !['DELIVERED_TO_DISTRIBUTOR', 'DELIVERED_TO_CLINIC', 'DELIVERED_TO_PHARMACY'].includes(product.status) && product.status !== chainStatus) {
      item.syncStatus = item.syncStatus === 'OK' ? 'STATUS_MISMATCH' : item.syncStatus;
      item.problems.push('Firebase status differs from on-chain status.');
    }

    summary[item.syncStatus] = (summary[item.syncStatus] || 0) + 1;
    items.push(item);
  }

  return { summary, items };
}

async function requireRecallReceipt(txHash: string) {
  if (!txHashPattern.test(txHash)) {
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

  if (
    contractClient.productRegistry?.target &&
    receipt.to &&
    receipt.to.toLowerCase() !== String(contractClient.productRegistry.target).toLowerCase()
  ) {
    const error: any = new Error('Transaction target does not match the active ProductRegistry contract');
    error.statusCode = 400;
    error.code = 'TX_CONTRACT_MISMATCH';
    throw error;
  }

  return receipt;
}

function requireBatchRecalledEvent(receipt: any) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = productRegistryEvents.parseLog(log);
      if (parsed?.name === 'BatchRecalled') {
        return parsed;
      }
    } catch {
      // Ignore logs emitted by other contracts.
    }
  }

  const error: any = new Error('Transaction did not emit BatchRecalled');
  error.statusCode = 400;
  error.code = 'TX_EVENT_MISMATCH';
  throw error;
}

async function writeRecallRecord(params: {
  batchHash: string;
  reason: string;
  reasonHash: string;
  serials: string[];
  txHash: string;
  authorityAddress?: string;
}) {
  const serialHashes = params.serials.map((serial) => toBytes32(serial));
  const now = Date.now();
  const recall = {
    id: params.batchHash,
    batchHash: params.batchHash,
    reason: params.reason,
    reasonHash: params.reasonHash,
    authorityAddress: params.authorityAddress || contractClient.getRoleAddress('RECALL_AUTHORITY'),
    serialsAffected: serialHashes.length,
    txHash: params.txHash,
    createdAt: now,
  };

  const updates: Record<string, unknown> = {
    [`recalls/${params.batchHash}`]: recall,
    [`batches/${params.batchHash}/recalledAt`]: now,
    [`batches/${params.batchHash}/updatedAt`]: now,
  };

  serialHashes.forEach((serialHash) => {
    updates[`products/${serialHash}/status`] = 'RECALLED';
    updates[`products/${serialHash}/riskLevel`] = 'CRITICAL';
    updates[`products/${serialHash}/updatedAt`] = now;
  });

  await db.ref().update(updates);
  return recall;
}

router.get('/admin/reconcile/preview', verifyToken, requireRole(['ADMIN']), async (_req: AuthRequest, res: Response) => {
  try {
    const preview = await buildReconcilePreview();
    res.json({ success: true, data: preview });
  } catch (error: any) {
    Logger.error('Reconcile preview error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'RECONCILE_PREVIEW_ERROR', message: getErrorMessage(error, 'Failed to preview Firebase/on-chain reconciliation') },
    });
  }
});

router.get('/admin/route-diagnostics', verifyToken, requireRole(['ADMIN']), async (_req: AuthRequest, res: Response) => {
  try {
    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: { code: 'CONTRACTS_NOT_READY', message: 'Smart contracts are not initialized' },
      });
    }

    const routeChecks = [
      ['MANUFACTURER', 'IMPORTER'],
      ['MANUFACTURER', 'DISTRIBUTOR'],
      ['IMPORTER', 'DISTRIBUTOR'],
      ['DISTRIBUTOR', 'CLINIC'],
      ['DISTRIBUTOR', 'PHARMACY'],
    ] as const;
    const routes = await Promise.all(routeChecks.map(async ([fromRole, toRole]) => ({
      fromRole,
      toRole,
      allowedOnChain: await contractClient.isValidRoute(fromRole, toRole),
      allowedByApiPolicy:
        (fromRole === 'MANUFACTURER' && toRole === 'DISTRIBUTOR') ||
        (fromRole === 'IMPORTER' && toRole === 'DISTRIBUTOR') ||
        (fromRole === 'DISTRIBUTOR' && ['CLINIC', 'PHARMACY'].includes(toRole)),
      mustBeBlocked: fromRole === 'MANUFACTURER' && toRole === 'IMPORTER',
    })));

    const invalidOpenRoutes = routes.filter((route) => route.mustBeBlocked && route.allowedOnChain);
    res.json({
      success: true,
      data: {
        routes,
        invalidOpenRoutes,
        healthy: invalidOpenRoutes.length === 0,
      },
    });
  } catch (error) {
    Logger.error('Route diagnostics error', error);
    res.status(500).json({
      success: false,
      error: { code: 'ROUTE_DIAGNOSTICS_ERROR', message: getErrorMessage(error, 'Failed to inspect transfer routes') },
    });
  }
});

router.post('/admin/route-diagnostics/apply', verifyToken, requireRole(['ADMIN']), async (_req: AuthRequest, res: Response) => {
  try {
    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: { code: 'CONTRACTS_NOT_READY', message: 'Smart contracts are not initialized' },
      });
    }

    const wasAllowed = await contractClient.isValidRoute('MANUFACTURER', 'IMPORTER');
    const txHash = wasAllowed
      ? await contractClient.setTransferRoute('MANUFACTURER', 'IMPORTER', false, 'admin')
      : null;

    res.json({
      success: true,
      data: {
        route: { fromRole: 'MANUFACTURER', toRole: 'IMPORTER' },
        changed: wasAllowed,
        allowedBefore: wasAllowed,
        allowedAfter: false,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Route diagnostics apply error', error);
    res.status(500).json({
      success: false,
      error: { code: 'ROUTE_DIAGNOSTICS_APPLY_ERROR', message: getErrorMessage(error, 'Failed to disable invalid transfer route') },
    });
  }
});

router.get('/admin/archived', verifyToken, requireRole(['ADMIN', 'RECALL_AUTHORITY']), async (_req: AuthRequest, res: Response) => {
  try {
    const [archivedProductsSnapshot, archivedBatchesSnapshot, productsSnapshot, batchesSnapshot] = await Promise.all([
      db.ref('archived-products').once('value'),
      db.ref('archived-batches').once('value'),
      db.ref('products').once('value'),
      db.ref('batches').once('value'),
    ]);
    const products = (productsSnapshot.val() || {}) as Record<string, any>;
    const batches = (batchesSnapshot.val() || {}) as Record<string, any>;
    const archivedProducts = Object.entries(archivedProductsSnapshot.val() || {}).map(([key, audit]: [string, any]) => ({
      id: key,
      ...audit,
      product: products[key] || Object.values(products).find((product: any) =>
        [product?.serialId, product?.serialHash].filter(Boolean).map((value) => String(value).toLowerCase()).includes(String(audit?.serialId || key).toLowerCase())
      ) || null,
    }));
    const archivedBatches = Object.entries(archivedBatchesSnapshot.val() || {}).map(([key, audit]: [string, any]) => ({
      id: key,
      ...audit,
      batch: batches[key] || Object.values(batches).find((batch: any) =>
        [batch?.id, batch?.batchHash, batch?.batchQR].filter(Boolean).map((value) => String(value).toLowerCase()).includes(String(audit?.batchId || key).toLowerCase())
      ) || null,
    }));

    archivedProducts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    archivedBatches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({
      success: true,
      data: {
        products: archivedProducts,
        batches: archivedBatches,
        total: archivedProducts.length + archivedBatches.length,
      },
    });
  } catch (error) {
    Logger.error('Get archived data error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_ARCHIVED_ERROR', message: getErrorMessage(error, 'Failed to fetch archived data') },
    });
  }
});

router.post('/admin/products/archive', verifyToken, requireRole(['ADMIN', 'RECALL_AUTHORITY']), async (req: AuthRequest, res: Response) => {
  try {
    const { serialIds, batchIds, reason = '', mode = 'ARCHIVE' } = req.body || {};
    const uniqueSerialIds = Array.from(new Set<string>((Array.isArray(serialIds) ? serialIds : [])
      .map((serialId: unknown) => String(serialId || '').trim())
      .filter(Boolean)));
    const uniqueBatchIds = Array.from(new Set<string>((Array.isArray(batchIds) ? batchIds : [])
      .map((batchId: unknown) => String(batchId || '').trim())
      .filter(Boolean)));
    const normalizedMode = String(mode || 'ARCHIVE').toUpperCase();

    if (uniqueSerialIds.length === 0 && uniqueBatchIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ARCHIVE_TARGETS', message: 'serialIds[] or batchIds[] is required.' },
      });
    }

    if (!['ARCHIVE', 'INVALIDATE'].includes(normalizedMode)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ARCHIVE_MODE', message: 'mode must be ARCHIVE or INVALIDATE.' },
      });
    }

    const now = Date.now();
    const updates: Record<string, unknown> = {};
    const archived: any[] = [];
    const archivedBatches: any[] = [];
    const failed: any[] = [];
    const actor = req.user?.address || req.user?.id || 'admin';
    const auditReason = String(reason || '').trim();
    const status = normalizedMode === 'INVALIDATE' ? 'INVALID' : 'ARCHIVED';

    const [productsSnapshot, batchesSnapshot] = await Promise.all([
      db.ref('products').once('value'),
      db.ref('batches').once('value'),
    ]);
    const products = (productsSnapshot.val() || {}) as Record<string, any>;
    const batches = (batchesSnapshot.val() || {}) as Record<string, any>;
    const productKeyBySerial = new Map<string, string>();

    Object.entries(products).forEach(([key, product]) => {
      const serialId = String(product?.serialId || key);
      productKeyBySerial.set(serialId, key);
      productKeyBySerial.set(toBytes32(serialId), key);
    });

    const serialsFromBatch = new Set<string>();
    for (const batchId of uniqueBatchIds) {
      const matchingBatchEntries = Object.entries(batches).filter(([key, batch]) =>
        [key, batch?.id, batch?.batchHash, batch?.batchQR]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .includes(batchId.toLowerCase())
      );
      const matchingProductEntries = Object.entries(products).filter(([, product]) =>
        [product?.batchId, product?.batchHash]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .includes(batchId.toLowerCase())
      );

      if (matchingBatchEntries.length === 0 && matchingProductEntries.length === 0) {
        failed.push({ batchId, code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found in Firebase.` });
        continue;
      }

      const audit = {
        batchId,
        mode: normalizedMode,
        reason: auditReason,
        actor,
        serialsAffected: matchingProductEntries.length,
        createdAt: now,
      };

      matchingBatchEntries.forEach(([batchKey]) => {
        updates[`batches/${batchKey}/archivedAt`] = now;
        updates[`batches/${batchKey}/archivedBy`] = actor;
        updates[`batches/${batchKey}/archiveReason`] = auditReason;
        updates[`batches/${batchKey}/updatedAt`] = now;
        updates[`archived-batches/${batchKey}`] = audit;
      });

      matchingProductEntries.forEach(([, product]) => {
        if (product?.serialId) serialsFromBatch.add(String(product.serialId));
      });
      archivedBatches.push({ batchId, serialsAffected: matchingProductEntries.length, status });
    }

    const allSerialIds = Array.from(new Set([...uniqueSerialIds, ...serialsFromBatch]));
    for (const serialId of allSerialIds) {
      const serialHash = toBytes32(serialId);
      const productKey = productKeyBySerial.get(serialId) || productKeyBySerial.get(serialHash);
      const product = productKey ? products[productKey] : null;
      if (!productKey || !product) {
        failed.push({ serialId, code: 'PRODUCT_NOT_FOUND', message: `Product ${serialId} not found in Firebase.` });
        continue;
      }

      const audit = {
        serialId,
        serialHash,
        mode: normalizedMode,
        reason: auditReason,
        actor,
        createdAt: now,
      };
      updates[`products/${productKey}/status`] = status;
      updates[`products/${productKey}/syncStatus`] = product?.blockchainTx ? 'OK' : 'FIREBASE_ONLY';
      updates[`products/${productKey}/updatedAt`] = now;
      updates[`products/${productKey}/archivedAt`] = now;
      updates[`products/${productKey}/archivedBy`] = audit.actor;
      updates[`products/${productKey}/archiveReason`] = audit.reason;
      if (normalizedMode === 'INVALIDATE') {
        updates[`products/${productKey}/invalidatedAt`] = now;
        updates[`products/${productKey}/invalidatedBy`] = audit.actor;
        updates[`products/${productKey}/invalidationReason`] = audit.reason;
      }
      updates[`archived-products/${serialHash}`] = audit;
      archived.push({ serialId, serialHash, status });
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    res.status(failed.length > 0 ? 207 : 200).json({
      success: failed.length === 0,
      data: {
        mode: normalizedMode,
        total: allSerialIds.length + uniqueBatchIds.length,
        archived,
        archivedBatches,
        failed,
      },
    });
  } catch (error) {
    Logger.error('Archive products error', error);
    res.status(500).json({
      success: false,
      error: { code: 'ARCHIVE_PRODUCTS_ERROR', message: getErrorMessage(error, 'Failed to archive products') },
    });
  }
});

router.post('/admin/reconcile/apply', verifyToken, requireRole(['ADMIN']), async (_req: AuthRequest, res: Response) => {
  try {
    const preview = await buildReconcilePreview();
    const now = Date.now();
    const updates: Record<string, unknown> = {};
    const applied: any[] = [];
    const skipped: any[] = [];

    for (const item of preview.items) {
      if (item.syncStatus === 'FIREBASE_ONLY') {
        updates[`products/${item.productKey}/syncStatus`] = 'FIREBASE_ONLY';
        updates[`products/${item.productKey}/updatedAt`] = now;
        applied.push({ serialId: item.serialId, syncStatus: item.syncStatus, action: 'marked_firebase_only' });
        continue;
      }

      if (!item.chainExists) {
        skipped.push({ serialId: item.serialId, reason: 'missing_on_chain' });
        continue;
      }

      if (item.syncStatus === 'OWNER_MISMATCH' || item.syncStatus === 'STATUS_MISMATCH') {
        updates[`products/${item.productKey}/currentOwner`] = item.chainOwner;
        updates[`products/${item.productKey}/ownerRole`] = item.chainOwnerRole || item.firebaseOwnerRole || null;
        updates[`products/${item.productKey}/status`] = item.chainStatus;
        updates[`products/${item.productKey}/syncStatus`] = 'OK';
        updates[`products/${item.productKey}/updatedAt`] = now;
        applied.push({ serialId: item.serialId, syncStatus: item.syncStatus, action: 'mirrored_chain_owner_status' });
        continue;
      }

      if (item.syncStatus === 'STALE_PENDING') {
        updates[`products/${item.productKey}/syncStatus`] = 'OK';
        updates[`products/${item.productKey}/status`] = item.chainStatus || 'VERIFIED';
        updates[`products/${item.productKey}/updatedAt`] = now;
        if (item.firebasePendingTransferId) {
          updates[`transfers/${item.firebasePendingTransferId}/status`] = 'REJECTED';
          updates[`transfers/${item.firebasePendingTransferId}/rejectedReason`] = 'Cleared by admin reconcile: stale Firebase pending transfer';
          updates[`transfers/${item.firebasePendingTransferId}/rejectedAt`] = now;
          updates[`transfers/${item.firebasePendingTransferId}/updatedAt`] = now;
          updates[`pending-transfers/${item.serialHash}`] = null;
        }
        applied.push({ serialId: item.serialId, syncStatus: item.syncStatus, action: 'cleared_stale_pending' });
        continue;
      }

      updates[`products/${item.productKey}/syncStatus`] = 'OK';
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    res.json({
      success: true,
      data: {
        summary: preview.summary,
        applied,
        skipped,
      },
    });
  } catch (error: any) {
    Logger.error('Reconcile apply error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'RECONCILE_APPLY_ERROR', message: getErrorMessage(error, 'Failed to apply Firebase/on-chain reconciliation') },
    });
  }
});

router.get('/risk-flags', async (_req: Request, res: Response) => {
  try {
    const ctx = getVisibilityContext(_req);
    const [snapshot, productsSnapshot, transfersSnapshot] = await Promise.all([
      db.ref('risk-flags').once('value'),
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
    ]);
    const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
    const decoratedProducts = (Object.values(productsSnapshot.val() || {}) as any[])
      .map((product) => decorateProduct(product, transfers));
    const visibleProducts = isAdminAuthorityContext(ctx)
      ? decoratedProducts
      : decoratedProducts.filter((product) => productVisibleTo(product, ctx));
    const productBySerial = new Map<string, any>();
    visibleProducts.forEach((product) => {
      if (product.serialId) productBySerial.set(String(product.serialId), product);
      if (product.serialHash) productBySerial.set(String(product.serialHash), product);
    });
    const items = (Object.values(snapshot.val() || {}) as any[]).filter((risk) => isAdminAuthorityContext(ctx) || riskVisibleTo(risk, ctx, productBySerial));
    res.json({ success: true, data: items });
  } catch (error) {
    Logger.error('Get risk flags error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAGS_ERROR', message: 'Failed to fetch risk flags' } });
  }
});

router.get('/risk-flags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref(`risk-flags/${id}`).once('value'),
      loadDecoratedProductIndex(),
    ]);

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'RISK_FLAG_NOT_FOUND', message: `Risk flag ${id} not found` },
      });
    }

    const risk = snapshot.val();
    const ctx = getVisibilityContext(req);
    if (!isAdminAuthorityContext(ctx) && !riskVisibleTo(risk, ctx, productBySerial)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view risk flags related to your role or wallet.' },
      });
    }

    res.json({ success: true, data: risk });
  } catch (error) {
    Logger.error('Get risk flag detail error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAG_ERROR', message: 'Failed to fetch risk flag' } });
  }
});

router.put('/risk-flags/:id/resolve', verifyToken, requireRole(['ADMIN', 'RECALL_AUTHORITY']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { note = '', resolvedBy = 'dashboard-user' } = req.body;
    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref(`risk-flags/${id}`).once('value'),
      loadDecoratedProductIndex(),
    ]);

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'RISK_FLAG_NOT_FOUND', message: `Risk flag ${id} not found` },
      });
    }

    const risk = snapshot.val();
    const ctx = getVisibilityContext(req);
    if (!isAdminAuthorityContext(ctx) && !riskVisibleTo(risk, ctx, productBySerial)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only resolve risk flags related to your role or wallet.' },
      });
    }

    const now = Date.now();
    const updates = {
      status: 'RESOLVED',
      resolutionNote: String(note || '').trim(),
      resolvedBy,
      resolvedAt: now,
      updatedAt: now,
    };

    await db.ref(`risk-flags/${id}`).update(updates);
    res.json({ success: true, data: { ...risk, ...updates } });
  } catch (error) {
    Logger.error('Resolve risk flag error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAG_RESOLVE_ERROR', message: 'Failed to resolve risk flag' } });
  }
});

router.get('/recalls', async (_req: Request, res: Response) => {
  try {
    const ctx = getVisibilityContext(_req);
    const [snapshot, productsSnapshot, transfersSnapshot] = await Promise.all([
      db.ref('recalls').once('value'),
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
    ]);
    const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
    const decoratedProducts = (Object.values(productsSnapshot.val() || {}) as any[])
      .map((product) => decorateProduct(product, transfers));
    const visibleProducts = isAdminAuthorityContext(ctx)
      ? decoratedProducts
      : decoratedProducts.filter((product) => productVisibleTo(product, ctx));
    const items = (Object.values(snapshot.val() || {}) as any[]).filter((recall) => isAdminAuthorityContext(ctx) || recallVisibleTo(recall, ctx, visibleProducts));
    res.json({ success: true, data: items });
  } catch (error) {
    Logger.error('Get recalls error', error);
    res.status(500).json({ success: false, error: { code: 'RECALLS_ERROR', message: 'Failed to fetch recalls' } });
  }
});

router.post('/recalls', verifyToken, requireRole(['RECALL_AUTHORITY', 'ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const { batchHash, reason, serials = [] } = req.body;

    if (!batchHash || !reason || !Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: batchHash, reason, serials[]',
        },
      });
    }

    const normalizedBatchHash = toBytes32(batchHash);
    const reasonHash = toBytes32(reason);
    const txHash = await contractClient.recallBatch(normalizedBatchHash, reasonHash, 'RECALL_AUTHORITY');
    const recall = await writeRecallRecord({
      batchHash: normalizedBatchHash,
      reason,
      reasonHash,
      serials,
      txHash,
      authorityAddress: req.user?.address,
    });
    res.json({ success: true, data: recall });
  } catch (error) {
    Logger.error('Create recall error', error);
    res.status(500).json({ success: false, error: { code: 'RECALL_ERROR', message: getErrorMessage(error, 'Failed to recall batch') } });
  }
});

router.post('/recalls/sync-wallet', verifyToken, requireRole(['RECALL_AUTHORITY', 'ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const { batchHash, reason, serials = [], txHash } = req.body;

    if (!batchHash || !reason || !txHash || !Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: batchHash, reason, serials[], txHash',
        },
      });
    }

    const normalizedBatchHash = toBytes32(batchHash);
    const reasonHash = toBytes32(reason);
    const receipt = await requireRecallReceipt(txHash);
    const event = requireBatchRecalledEvent(receipt);

    if (!sameHex(String(event.args.batchHash), normalizedBatchHash)) {
      const error: any = new Error('Transaction batchHash does not match request payload');
      error.statusCode = 400;
      error.code = 'TX_BATCH_MISMATCH';
      throw error;
    }

    if (!sameHex(String(event.args.reasonHash), reasonHash)) {
      const error: any = new Error('Transaction reasonHash does not match request payload');
      error.statusCode = 400;
      error.code = 'TX_REASON_MISMATCH';
      throw error;
    }

    const recall = await writeRecallRecord({
      batchHash: normalizedBatchHash,
      reason,
      reasonHash,
      serials,
      txHash,
      authorityAddress: req.user?.address,
    });

    res.json({ success: true, data: recall });
  } catch (error: any) {
    Logger.error('Sync wallet recall error', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'WALLET_RECALL_SYNC_ERROR', message: getErrorMessage(error, 'Failed to sync wallet recall') },
    });
  }
});

router.get('/disputes', async (_req: Request, res: Response) => {
  try {
    const ctx = getVisibilityContext(_req);
    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref('disputes').once('value'),
      loadDecoratedProductIndex(),
    ]);
    const items = (Object.values(snapshot.val() || {}) as any[])
      .filter((dispute) => disputeVisibleTo(dispute, ctx, productBySerial));
    res.json({ success: true, data: items });
  } catch (error) {
    Logger.error('Get disputes error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTES_ERROR', message: 'Failed to fetch disputes' } });
  }
});

router.get('/disputes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref(`disputes/${id}`).once('value'),
      loadDecoratedProductIndex(),
    ]);

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    const dispute = snapshot.val();
    if (!disputeVisibleTo(dispute, getVisibilityContext(req), productBySerial)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view disputes related to your role or wallet.' },
      });
    }

    res.json({ success: true, data: dispute });
  } catch (error) {
    Logger.error('Get dispute detail error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_DETAIL_ERROR', message: 'Failed to fetch dispute' } });
  }
});

router.put('/disputes/:id/status', verifyToken, requireRole(['ADMIN', 'RECALL_AUTHORITY']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, note = '', updatedBy = 'dashboard-user' } = req.body;
    const allowedStatuses = ['OPEN', 'INVESTIGATING', 'NEEDS_EXPLANATION', 'RESOLVED', 'REJECTED', 'RECALL_CREATED'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DISPUTE_STATUS',
          message: `status must be one of: ${allowedStatuses.join(', ')}`,
        },
      });
    }

    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref(`disputes/${id}`).once('value'),
      loadDecoratedProductIndex(),
    ]);
    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    const dispute = snapshot.val();
    if (!isAdminAuthorityRequest(req) || !disputeVisibleTo(dispute, getVisibilityContext(req), productBySerial)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admin authority can update dispute status.' },
      });
    }

    const now = Date.now();
    const statusHistory = Array.isArray(dispute.statusHistory) ? dispute.statusHistory : [];
    const updates = {
      status,
      statusNote: String(note || '').trim(),
      updatedBy,
      updatedAt: now,
      closedAt: ['RESOLVED', 'REJECTED', 'RECALL_CREATED'].includes(status) ? now : dispute.closedAt || null,
      statusHistory: [
        ...statusHistory,
        {
          status,
          note: String(note || '').trim(),
          updatedBy,
          createdAt: now,
        },
      ],
    };

    await db.ref(`disputes/${id}`).update(updates);
    res.json({ success: true, data: { ...dispute, ...updates } });
  } catch (error) {
    Logger.error('Update dispute status error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_STATUS_ERROR', message: 'Failed to update dispute status' } });
  }
});

router.post('/disputes/:id/evidence', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type = 'NOTE', title = 'Evidence', value, addedBy = 'dashboard-user' } = req.body;

    if (!value || typeof value !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EVIDENCE', message: 'value is required' },
      });
    }

    const [snapshot, { productBySerial }] = await Promise.all([
      db.ref(`disputes/${id}`).once('value'),
      loadDecoratedProductIndex(),
    ]);
    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    const dispute = snapshot.val();
    if (!disputeVisibleTo(dispute, getVisibilityContext(req), productBySerial)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only add evidence to disputes related to your role or wallet.' },
      });
    }

    const now = Date.now();
    const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
    const evidenceItem = {
      id: `EVIDENCE-${now}`,
      type,
      title,
      value: value.trim(),
      addedBy: req.user?.address || addedBy,
      addedByRole: req.user?.role || null,
      createdAt: now,
    };

    const updates = {
      evidence: [...evidence, evidenceItem],
      updatedAt: now,
    };

    await db.ref(`disputes/${id}`).update(updates);
    res.json({ success: true, data: { ...dispute, ...updates } });
  } catch (error) {
    Logger.error('Add dispute evidence error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_EVIDENCE_ERROR', message: 'Failed to add dispute evidence' } });
  }
});

router.post('/disputes', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      relatedSerialId,
      targetId: rawTargetId,
      targetType: rawTargetType,
      reportedBy = 'demo-user',
      reason,
      evidenceIpfsCid,
    } = req.body;
    const targetType = normalizeTargetType(rawTargetType);
    const targetId = String(rawTargetId || relatedSerialId || '').trim();

    if (!targetId || !reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: targetId/relatedSerialId, reason',
        },
      });
    }

    const target = await targetExists(targetType, targetId);
    if (!target.exists) {
      return res.status(404).json({
        success: false,
        error: { code: 'TARGET_NOT_FOUND', message: `${targetType} ${targetId} not found.` },
      });
    }

    const now = Date.now();
    const id = `DISPUTE-${now}`;
    const dispute: any = {
      id,
      targetType,
      targetId,
      relatedSerialId: targetType === 'SERIAL' ? targetId : '',
      relatedBatchId: targetType === 'BATCH' ? targetId : target?.product?.batchId || '',
      reportedBy,
      reportedByAddress: req.user?.address || null,
      createdByAddress: req.user?.address || null,
      createdByRole: req.user?.role || null,
      status: 'OPEN',
      reason,
      createdAt: now,
      updatedAt: now,
    };
    
    if (evidenceIpfsCid) {
      dispute.evidenceIpfsCid = evidenceIpfsCid;
    }

    await db.ref(`disputes/${id}`).set(dispute);
    res.json({ success: true, data: dispute });
  } catch (error) {
    Logger.error('Create dispute error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_ERROR', message: 'Failed to create dispute' } });
  }
});

export default router;

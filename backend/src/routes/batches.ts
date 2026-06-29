import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { Batch, Product } from '../types';
import {
  batchVisibleTo,
  decorateBatch,
  decorateProduct,
  getVisibilityContext,
  isAddressMatch,
  productVisibleTo,
} from '../services/visibility';

const router = Router();

function isArchivedBatch(batch: any): boolean {
  return Boolean(batch?.archivedAt || ['ARCHIVED', 'INVALID'].includes(String(batch?.status || '').toUpperCase()));
}

function batchOwnedByContext(batch: any, visibility: ReturnType<typeof getVisibilityContext>) {
  if (!visibility.isAuthenticated) return false;
  if (isAddressMatch(batch?.currentOwner, visibility.address)) return true;
  if (isAddressMatch(batch?.manufacturerAddress, visibility.address)) return true;
  const role = String(batch?.ownerRole || '').toUpperCase();
  return Boolean(role && visibility.roles.includes(role));
}

/**
 * GET /batches
 * List all batches from Firebase
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const req = _req;
    const visibility = getVisibilityContext(req);
    const [batchSnapshot, productSnapshot, transferSnapshot] = await Promise.all([
      db.ref('batches').once('value'),
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
    ]);
    const batchesData = batchSnapshot.val() || {};
    const transfers = Object.values(transferSnapshot.val() || {}) as any[];
    const visibleProducts = (Object.values(productSnapshot.val() || {}) as Product[])
      .map((product) => decorateProduct(product, transfers))
      .filter((product) => productVisibleTo(product, visibility));
    const batches = (Object.values(batchesData) as Batch[])
      .filter((batch) => !isArchivedBatch(batch))
      .filter((batch) => visibility.scope === 'all' || batchVisibleTo(batch, visibleProducts) || batchOwnedByContext(batch, visibility))
      .map((batch) => decorateBatch(batch, visibleProducts));

    batches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ success: true, data: batches });
  } catch (error) {
    Logger.error('Get batches error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_BATCHES_ERROR', message: 'Failed to fetch batches' },
    });
  }
});

/**
 * GET /batches/:batchId
 * Get single batch by batchId (Firebase key is batchHash)
 */
router.get('/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const visibility = getVisibilityContext(req);

    // Try direct lookup first, then scan by batchId field
    let snapshot = await db.ref(`batches/${batchId}`).once('value');
    let found: Batch | null = null;

    if (!snapshot.exists()) {
      const allSnapshot = await db.ref('batches').once('value');
      const allBatches = allSnapshot.val() || {};
      found = Object.values(allBatches as Record<string, Batch>).find(
        (b) => b.id === batchId
      ) || null;

      if (!found) {
        return res.status(404).json({
          success: false,
          error: { code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` },
        });
      }

    } else {
      found = snapshot.val();
    }

    if (!found) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` },
      });
    }

    if (isArchivedBatch(found)) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_ARCHIVED', message: `Batch ${batchId} is archived and hidden from the web view` },
      });
    }

    const [productsSnapshot, transfersSnapshot] = await Promise.all([
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
    ]);
    const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
    const visibleProducts = (Object.values(productsSnapshot.val() || {}) as Product[])
      .map((product) => decorateProduct(product, transfers))
      .filter((product) => productVisibleTo(product, visibility));

    if (visibility.scope !== 'all' && !batchVisibleTo(found, visibleProducts) && !batchOwnedByContext(found, visibility)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view batches that contain products visible to your role.' },
        timestamp: Date.now(),
      });
    }

    res.json({ success: true, data: decorateBatch(found, visibleProducts) });
  } catch (error) {
    Logger.error('Get batch error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_BATCH_ERROR', message: 'Failed to fetch batch' },
    });
  }
});

/**
 * GET /batches/:batchId/serials
 * Get all products (serials) belonging to a batch
 */
router.get('/:batchId/serials', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const visibility = getVisibilityContext(req);

    const [productsSnapshot, transfersSnapshot] = await Promise.all([
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
    ]);
    const allProducts = productsSnapshot.val() || {};
    const transfers = Object.values(transfersSnapshot.val() || {}) as any[];
    const serials = Object.values(allProducts as Record<string, Product>)
      .map((product) => decorateProduct(product, transfers))
      .filter((p) => p.batchId === batchId || p.batchHash === batchId)
      .filter((product) => productVisibleTo(product, visibility));

    serials.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    res.json({ success: true, data: serials });
  } catch (error) {
    Logger.error('Get batch serials error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_SERIALS_ERROR', message: 'Failed to fetch serials' },
    });
  }
});

export default router;

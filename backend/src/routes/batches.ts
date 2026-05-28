import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { Batch, Product } from '../types';

const router = Router();

/**
 * GET /batches
 * List all batches from Firebase
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.ref('batches').once('value');
    const data = snapshot.val() || {};
    const batches = Object.values(data) as Batch[];

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

    // Try direct lookup first, then scan by batchId field
    let snapshot = await db.ref(`batches/${batchId}`).once('value');

    if (!snapshot.exists()) {
      const allSnapshot = await db.ref('batches').once('value');
      const allBatches = allSnapshot.val() || {};
      const found = Object.values(allBatches as Record<string, Batch>).find(
        (b) => b.id === batchId
      );

      if (!found) {
        return res.status(404).json({
          success: false,
          error: { code: 'BATCH_NOT_FOUND', message: `Batch ${batchId} not found` },
        });
      }

      return res.json({ success: true, data: found });
    }

    res.json({ success: true, data: snapshot.val() });
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

    const productsSnapshot = await db.ref('products').once('value');
    const allProducts = productsSnapshot.val() || {};
    const serials = Object.values(allProducts as Record<string, Product>).filter(
      (p) => p.batchId === batchId
    );

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

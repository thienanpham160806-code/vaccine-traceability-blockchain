import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { DashboardStats } from '../types';

const router = Router();

/**
 * GET /dashboard/overview
 * Return dashboard statistics
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    Logger.info('Fetching dashboard overview');

    // Get counts from Firebase
    const batchesRef = db.ref('batches');
    const transfersRef = db.ref('transfers');
    const riskFlagsRef = db.ref('risk-flags');

    const [batchesSnapshot, transfersSnapshot, riskFlagsSnapshot] = await Promise.all([
      batchesRef.once('value'),
      transfersRef.once('value'),
      riskFlagsRef.once('value'),
    ]);

    const batches = batchesSnapshot.val() || {};
    const transfers = transfersSnapshot.val() || {};
    const riskFlags = riskFlagsSnapshot.val() || {};

    // Calculate stats
    const totalBatches = Object.keys(batches).length;
    
    // Count total serials (sum of quantities in batches)
    let totalSerials = 0;
    Object.values(batches).forEach((batch: any) => {
      totalSerials += batch.quantity || 1;
    });

    // Count pending transfers
    const pendingTransfers = Object.values(transfers).filter(
      (transfer: any) => transfer.status === 'PENDING'
    ).length;

    // Count risk alerts
    const riskAlerts = Object.keys(riskFlags).length;

    const stats: DashboardStats = {
      totalBatches,
      totalSerials,
      pendingTransfers,
      riskAlerts,
    };

    Logger.info('Dashboard stats calculated', stats);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    Logger.error('Dashboard overview error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: 'Failed to fetch dashboard overview',
      },
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { DashboardActivity, DashboardStats } from '../types';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_ROLE = 'ADMIN';
const OPERATION_ROLES = ['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY'];
const ALL_DASHBOARD_ROLES = [...OPERATION_ROLES, 'RECALL_AUTHORITY', ADMIN_ROLE];

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function timestampOf(value: any): number {
  const raw = value?.updatedAt || value?.createdAt || value?.confirmedAt || value?.rejectedAt || value?.recalledAt;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function fallbackSerial(key: string, product: any): string {
  return product?.serialId || product?.serialID || key;
}

function makeTrend(items: any[]): Array<{ date: string; count: number }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return {
      date: date.toISOString().slice(0, 10),
      count: 0,
    };
  });

  items.forEach((item) => {
    const timestamp = timestampOf(item);
    if (!timestamp) return;
    const index = Math.floor((timestamp - start.getTime()) / DAY_MS);
    if (index >= 0 && index < buckets.length) {
      buckets[index].count += 1;
    }
  });

  return buckets;
}

function recentProductActivity(key: string, product: any): DashboardActivity {
  const serialId = fallbackSerial(key, product);
  const ownerRole = product?.origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER';
  return {
    id: `product-${key}`,
    type: 'PRODUCT',
    title: product?.productName || 'Product registered',
    subtitle: `${serialId}${product?.batchId ? ` · Batch ${product.batchId}` : ''}`,
    status: product?.status || 'UNKNOWN',
    href: `/dashboard/verify/${encodeURIComponent(serialId)}`,
    timestamp: timestampOf(product),
    audienceRoles: [ownerRole, ADMIN_ROLE],
  };
}

function recentTransferActivity(key: string, transfer: any): DashboardActivity {
  const serialId = transfer?.serialId || key;
  const fromRole = transfer?.fromRole || 'UNKNOWN';
  const toRole = transfer?.toRole || 'UNKNOWN';
  const rejectionReason = transfer?.rejectedReason || transfer?.rejectionReason;
  const rejectedSubtitle =
    (transfer?.status === 'REJECTED' || transfer?.status === 'RETURNED') && rejectionReason
      ? `${serialId} · ${rejectionReason}`
      : serialId;
  const audienceRoles =
    transfer?.status === 'PENDING'
      ? [toRole, ADMIN_ROLE]
      : Array.from(new Set([fromRole, toRole, ADMIN_ROLE].filter((role) => role !== 'UNKNOWN')));

  return {
    id: `transfer-${key}`,
    type: 'TRANSFER',
    title: `${fromRole} -> ${toRole}`,
    subtitle: rejectedSubtitle,
    status: transfer?.status || 'UNKNOWN',
    href: `/dashboard/transfers/${encodeURIComponent(transfer?.id || key)}`,
    timestamp: timestampOf(transfer),
    audienceRoles,
  };
}

function recentRiskActivity(key: string, risk: any): DashboardActivity {
  const serialId = risk?.serialId || key;
  return {
    id: `risk-${key}`,
    type: 'RISK',
    title: risk?.reason || 'Risk alert',
    subtitle: serialId,
    status: risk?.level ? `LEVEL_${risk.level}` : 'ALERT',
    href: '/dashboard/risk-dispute',
    timestamp: timestampOf(risk),
    audienceRoles: ['RECALL_AUTHORITY', ADMIN_ROLE],
  };
}

function recentRecallActivity(key: string, recall: any): DashboardActivity {
  const batchHash = recall?.batchHash || key;
  return {
    id: `recall-${key}`,
    type: 'RECALL',
    title: 'Batch recalled',
    subtitle: batchHash,
    status: 'RECALLED',
    href: '/dashboard/recall',
    timestamp: timestampOf(recall),
    audienceRoles: ALL_DASHBOARD_ROLES,
  };
}

/**
 * GET /dashboard/overview
 * Return dashboard statistics
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    Logger.info('Fetching dashboard overview');

    const [batchesSnapshot, productsSnapshot, transfersSnapshot, riskFlagsSnapshot, recallsSnapshot] = await Promise.all([
      db.ref('batches').once('value'),
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
      db.ref('risk-flags').once('value'),
      db.ref('recalls').once('value'),
    ]);

    const batches = asRecord(batchesSnapshot.val());
    const products = asRecord(productsSnapshot.val());
    const transfers = asRecord(transfersSnapshot.val());
    const riskFlags = asRecord(riskFlagsSnapshot.val());
    const recalls = asRecord(recallsSnapshot.val());

    const totalBatches = Object.keys(batches).length;
    const totalProducts = Object.keys(products).length;
    const totalSerials = totalProducts || Object.values(batches).reduce((sum: number, batch: any) => {
      const quantity = Number(batch?.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    }, 0);
    const pendingTransfers = Object.values(transfers).filter(
      (transfer: any) => transfer.status === 'PENDING'
    ).length;
    const riskAlerts = Object.keys(riskFlags).length;
    const recalledFromBatches = Object.values(batches).filter((batch: any) => Boolean(batch?.recalledAt)).length;
    const recalledBatches = Math.max(Object.keys(recalls).length, recalledFromBatches);
    const last7DaysTrend = makeTrend([
      ...Object.values(products),
      ...Object.values(transfers),
      ...Object.values(riskFlags),
      ...Object.values(recalls),
    ]);

    const stats: DashboardStats = {
      totalBatches,
      totalSerials,
      pendingTransfers,
      riskAlerts,
      totalProducts,
      recalledBatches,
      last7DaysTrend,
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

/**
 * GET /dashboard/recent-activity
 * Return latest product, transfer, risk, and recall events.
 */
router.get('/recent-activity', async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit || 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;

    const [productsSnapshot, transfersSnapshot, riskFlagsSnapshot, recallsSnapshot] = await Promise.all([
      db.ref('products').once('value'),
      db.ref('transfers').once('value'),
      db.ref('risk-flags').once('value'),
      db.ref('recalls').once('value'),
    ]);

    const products = asRecord(productsSnapshot.val());
    const transfers = asRecord(transfersSnapshot.val());
    const riskFlags = asRecord(riskFlagsSnapshot.val());
    const recalls = asRecord(recallsSnapshot.val());

    const activities: DashboardActivity[] = [
      ...Object.entries(products).map(([key, product]) => recentProductActivity(key, product)),
      ...Object.entries(transfers).map(([key, transfer]) => recentTransferActivity(key, transfer)),
      ...Object.entries(riskFlags).map(([key, risk]) => recentRiskActivity(key, risk)),
      ...Object.entries(recalls).map(([key, recall]) => recentRecallActivity(key, recall)),
    ]
      .filter((activity) => activity.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    Logger.error('Recent activity error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RECENT_ACTIVITY_ERROR',
        message: 'Failed to fetch recent activity',
      },
    });
  }
});

export default router;

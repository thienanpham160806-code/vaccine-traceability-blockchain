import { Router, Response } from 'express';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { txQueue } from '../services/txQueue';
import { merkleService } from '../services/merkle';
import config from '../config/env';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { disaggregateSchema } from '../schemas/disaggregate';

const router = Router();

function httpError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getErrorMessage(error: any, fallback: string): string {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

/**
 * Resolves a lot id (human code or hash) against EITHER top-level batches/
 * or an existing sub-lots/ record — a sub-lot can itself be split further
 * (multi-tier disaggregation), but the authenticity anchor for every unit
 * always stays the root ancestor lot's aggregationRoot, never a sub-lot's.
 */
async function resolveParentLot(lotId: string): Promise<{ key: string; collection: 'batches' | 'sub-lots'; record: any } | null> {
  const directBatch = await db.ref(`batches/${lotId}`).once('value');
  if (directBatch.exists()) return { key: lotId, collection: 'batches', record: directBatch.val() };

  const directSubLot = await db.ref(`sub-lots/${lotId}`).once('value');
  if (directSubLot.exists()) return { key: lotId, collection: 'sub-lots', record: directSubLot.val() };

  const indexSnap = await db.ref(`lot-index/${lotId}`).once('value');
  const indexedLotIdHash: string | null = indexSnap.val();
  if (indexedLotIdHash) {
    const batchSnap = await db.ref(`batches/${indexedLotIdHash}`).once('value');
    if (batchSnap.exists()) return { key: indexedLotIdHash, collection: 'batches', record: batchSnap.val() };
    const subLotSnap = await db.ref(`sub-lots/${indexedLotIdHash}`).once('value');
    if (subLotSnap.exists()) return { key: indexedLotIdHash, collection: 'sub-lots', record: subLotSnap.val() };
  }

  return null;
}

/**
 * POST /disaggregate
 * Split a lot (or an existing sub-lot) into a sub-lot bound for a single
 * destination. No re-commissioning and no per-unit on-chain writes — this
 * only records which sub-tree/actor a unit currently belongs to; the
 * Merkle proof every unit is verified against at dispense time always
 * traces back to the root ancestor lot's aggregationRoot (see
 * services/merkle.ts + ProductRegistry.decommissionUnit), so nothing here
 * can forge authenticity even if a unit id is picked in error.
 */
router.post(
  '/',
  verifyToken,
  requireRole(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'ADMIN']),
  validateRequest({ body: disaggregateSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { lotId, unitIdHashes, quantity, toRole, receiverAddress: rawReceiverAddress } = req.body;

      if (!config.systemSalt) {
        throw httpError(503, 'SYSTEM_SALT_NOT_CONFIGURED', 'SYSTEM_SALT is not configured on the backend');
      }
      if (!contractClient.isInitialized()) {
        throw httpError(503, 'CONTRACTS_NOT_READY', 'Smart contracts are not initialized');
      }

      const found = await resolveParentLot(String(lotId));
      if (!found) {
        throw httpError(404, 'LOT_NOT_FOUND', `Lot ${lotId} not found`);
      }
      const { key: parentLotIdHash, record: parentLot } = found;

      if (parentLot?.archivedAt || parentLot?.recalledAt || String(parentLot?.status || '').toUpperCase() === 'RECALLED') {
        throw httpError(400, 'LOT_NOT_ACTIVE', `Lot ${lotId} is not active inventory`);
      }

      const parentLotExistsOnChain = await contractClient.lotExists(parentLotIdHash);
      if (!parentLotExistsOnChain) {
        throw httpError(409, 'LOT_SYNC_MISMATCH', `Lot ${lotId} chưa được xác nhận trên chain. Chờ commission/disaggregate cha xong trước.`);
      }

      const receiverAddress = rawReceiverAddress || contractClient.getRoleAddress(toRole);
      if (!CryptoUtils.isValidAddress(receiverAddress)) {
        throw httpError(400, 'INVALID_RECEIVER', 'receiverAddress must be a valid Ethereum address');
      }

      // Eligible units: currently point at this parent lot (a unit "belongs"
      // to whichever lot its products/{unitIdHash}.lotIdHash currently
      // says — disaggregating reassigns that pointer, so a unit already
      // moved into a different sub-lot won't be picked up twice).
      const unitsSnapshot = await db.ref('products').orderByChild('lotIdHash').equalTo(parentLotIdHash).once('value');
      const eligibleUnitIdHashes: string[] = [];
      unitsSnapshot.forEach((child: any) => {
        const product = child.val();
        if (['RECALLED', 'INVALID', 'ARCHIVED', 'ADMINISTERED'].includes(String(product?.status || '').toUpperCase())) return false;
        if (child.key) eligibleUnitIdHashes.push(child.key);
        return false;
      });

      let subset: string[];
      if (unitIdHashes?.length) {
        const eligibleSet = new Set(eligibleUnitIdHashes);
        const ineligible = unitIdHashes.filter((h: string) => !eligibleSet.has(h));
        if (ineligible.length > 0) {
          throw httpError(409, 'UNITS_NOT_IN_LOT', `${ineligible.length} unit(s) do not currently belong to lot ${lotId} (e.g. ${ineligible[0]})`);
        }
        subset = unitIdHashes;
      } else {
        if (eligibleUnitIdHashes.length < quantity) {
          throw httpError(409, 'INSUFFICIENT_UNITS', `Lot ${lotId} only has ${eligibleUnitIdHashes.length} eligible unit(s), requested ${quantity}`);
        }
        subset = eligibleUnitIdHashes.slice(0, quantity);
      }

      const subLotIdHash = CryptoUtils.hashWithSalt(`${parentLotIdHash}:sub:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`, config.systemSalt);
      const tree = merkleService.build(subset);
      const subLotRoot = tree.root;
      const toActorHash = CryptoUtils.hashWithSalt(receiverAddress, config.systemSalt);

      const signerRole = req.user?.role || 'MANUFACTURER';
      const now = Date.now();
      const job = await txQueue.enqueue({
        type: 'DISAGGREGATE',
        payload: {
          parentLotIdHash,
          subLotIdHash,
          subLotRoot,
          toActorHash,
          timestamp: Math.floor(now / 1000),
          signerRole,
        },
        metadata: { subLotIdHash, parentLotIdHash },
      });

      const subLot = {
        id: subLotIdHash,
        subLotIdHash,
        parentLotIdHash,
        aggregationRoot: subLotRoot,
        unitLeaves: subset,
        quantity: subset.length,
        lotSalt: parentLot?.lotSalt || null,
        productName: parentLot?.productName,
        manufacturerName: parentLot?.manufacturerName,
        manufacturerAddress: parentLot?.manufacturerAddress,
        expiryDate: parentLot?.expiryDate,
        origin: parentLot?.origin,
        toActor: receiverAddress,
        toRole,
        status: 'ACTIVE',
        syncStatus: 'PROCESSING',
        processingJobId: job.id,
        createdAt: now,
        updatedAt: now,
      };

      const updates: Record<string, unknown> = {
        [`sub-lots/${subLotIdHash}`]: subLot,
      };
      for (const unitIdHash of subset) {
        updates[`products/${unitIdHash}/lotIdHash`] = subLotIdHash;
        updates[`products/${unitIdHash}/updatedAt`] = now;
      }
      await db.ref().update(updates);

      res.json({ success: true, data: { subLot, subLotIdHash, parentLotIdHash, unitCount: subset.length, jobId: job.id } });
    } catch (error: any) {
      Logger.error('Disaggregate lot error', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: { code: error.code || 'DISAGGREGATE_ERROR', message: getErrorMessage(error, 'Failed to disaggregate lot') },
        timestamp: Date.now(),
      });
    }
  }
);

/**
 * GET /disaggregate/:lotId/sub-lots
 * List every direct sub-lot of a parent lot.
 */
router.get('/:lotId/sub-lots', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const found = await resolveParentLot(String(req.params.lotId));
    if (!found) {
      return res.status(404).json({ success: false, error: { code: 'LOT_NOT_FOUND', message: `Lot ${req.params.lotId} not found` } });
    }

    const snapshot = await db.ref('sub-lots').orderByChild('parentLotIdHash').equalTo(found.key).once('value');
    const subLots = Object.values(snapshot.val() || {}) as any[];
    subLots.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ success: true, data: subLots });
  } catch (error) {
    Logger.error('Get sub-lots error', error);
    res.status(500).json({ success: false, error: { code: 'GET_SUB_LOTS_ERROR', message: 'Failed to fetch sub-lots' } });
  }
});

export default router;

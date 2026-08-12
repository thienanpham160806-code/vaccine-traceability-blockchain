import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { txQueue } from '../services/txQueue';
import { ipfsService } from '../services/ipfs';
import { merkleService } from '../services/merkle';
import { devicesService } from '../services/devices';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { coldChainReadingSchema, legParamsSchema, registerDeviceSchema, sealLegSchema } from '../schemas/coldchain';

const router = Router();

const LEG_SEAL_ROLES = ['DISTRIBUTOR', 'CLINIC', 'PHARMACY', 'ADMIN'];

function getErrorMessage(error: any, fallback: string): string {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

function httpError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * POST /coldchain/devices
 * Register (or update) a sensor source's public address. No private keys
 * ever pass through here — the device signs locally and only its address
 * is registered.
 */
router.post(
  '/devices',
  verifyToken,
  requireRole(['ADMIN', 'MANUFACTURER', 'DISTRIBUTOR']),
  validateRequest({ body: registerDeviceSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { deviceId, address, label } = req.body;
      const device = await devicesService.registerDevice(deviceId, address, label);
      res.json({ success: true, data: device });
    } catch (error) {
      Logger.error('Register device error', error);
      res.status(500).json({
        success: false,
        error: { code: 'REGISTER_DEVICE_ERROR', message: getErrorMessage(error, 'Failed to register device') },
      });
    }
  }
);

/**
 * POST /coldchain/readings
 * Fixed ingestion endpoint — simulator today, real hardware (ESP32) later,
 * unchanged. No JWT: the device proves itself via its own signature over
 * the reading, verified against devices/{deviceId}.address.
 */
router.post('/readings', validateRequest({ body: coldChainReadingSchema }), async (req: Request, res: Response) => {
  try {
    const { legId, deviceId, timestamp, temperatureC, humidityPct, gpsLat, gpsLng, signature } = req.body;

    const verification = await devicesService.verifyReadingSignature({ legId, deviceId, timestamp, temperatureC }, signature);
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'DEVICE_SIGNATURE_INVALID', message: verification.reason || 'Invalid device signature' },
      });
    }

    const legSnapshot = await db.ref(`cold-chain-legs/${legId}`).once('value');
    if (!legSnapshot.exists()) {
      return res.status(404).json({ success: false, error: { code: 'LEG_NOT_FOUND', message: `Cold-chain leg ${legId} not found` } });
    }
    const leg = legSnapshot.val();
    if (!['OPEN', 'CLOSED_PENDING_SEAL'].includes(String(leg.status || '').toUpperCase())) {
      return res.status(409).json({
        success: false,
        error: { code: 'LEG_NOT_ACCEPTING_READINGS', message: `Leg ${legId} is ${leg.status} and no longer accepting readings` },
      });
    }

    const reading = {
      legId,
      deviceId,
      timestamp,
      temperatureC,
      ...(humidityPct !== undefined ? { humidityPct } : {}),
      ...(gpsLat !== undefined ? { gpsLat } : {}),
      ...(gpsLng !== undefined ? { gpsLng } : {}),
      signature,
      receivedAt: Date.now(),
    };
    const readingId = `${timestamp}-${Math.random().toString(16).slice(2, 8)}`;
    const isExcursion = temperatureC < Number(leg.thresholdMinC) || temperatureC > Number(leg.thresholdMaxC);

    await db.ref().update({
      [`cold-chain-readings/${legId}/${readingId}`]: reading,
      [`cold-chain-legs/${legId}/readingCount`]: Number(leg.readingCount || 0) + 1,
      [`cold-chain-legs/${legId}/excursionCount`]: Number(leg.excursionCount || 0) + (isExcursion ? 1 : 0),
      [`cold-chain-legs/${legId}/updatedAt`]: Date.now(),
    });

    res.json({ success: true, data: { readingId, isExcursion } });
  } catch (error) {
    Logger.error('Ingest cold-chain reading error', error);
    res.status(500).json({
      success: false,
      error: { code: 'INGEST_READING_ERROR', message: getErrorMessage(error, 'Failed to ingest reading') },
    });
  }
});

/**
 * POST /coldchain/legs/:legId/seal
 * Closes a leg: builds the Merkle tree of every reading, computes the
 * pass/fail compliance predicate, pins the full readings to IPFS, and
 * enqueues ANCHOR_ENV to anchor the root + flag on-chain.
 */
router.post(
  '/legs/:legId/seal',
  verifyToken,
  requireRole(LEG_SEAL_ROLES),
  validateRequest({ params: legParamsSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { legId } = req.params;
      const legSnapshot = await db.ref(`cold-chain-legs/${legId}`).once('value');
      if (!legSnapshot.exists()) {
        throw httpError(404, 'LEG_NOT_FOUND', `Cold-chain leg ${legId} not found`);
      }
      const leg = legSnapshot.val();
      if (!['OPEN', 'CLOSED_PENDING_SEAL'].includes(String(leg.status || '').toUpperCase())) {
        throw httpError(409, 'LEG_ALREADY_SEALED', `Leg ${legId} is already ${leg.status}`);
      }

      const readingsSnapshot = await db.ref(`cold-chain-readings/${legId}`).once('value');
      const readingsById = readingsSnapshot.val() || {};
      const readingIds = Object.keys(readingsById);
      if (readingIds.length === 0) {
        throw httpError(409, 'LEG_HAS_NO_READINGS', `Leg ${legId} has no readings to seal`);
      }

      const readings = readingIds.map((id) => readingsById[id]);
      const readingHashes = readings.map((reading) => CryptoUtils.keccak256(JSON.stringify(reading)));
      const tree = merkleService.build(readingHashes);
      const envMerkleRoot = tree.root;

      const timestamps = readings.map((r) => Number(r.timestamp));
      const windowStart = Math.min(...timestamps);
      const windowEnd = Math.max(...timestamps);
      const thresholdMinC = Number(leg.thresholdMinC);
      const thresholdMaxC = Number(leg.thresholdMaxC);
      const complianceFlag = readings.every((r) => Number(r.temperatureC) >= thresholdMinC && Number(r.temperatureC) <= thresholdMaxC);

      const ipfsResult = await ipfsService.pinJson(`coldchain-leg-${legId}`, {
        legId,
        lotIdHash: leg.lotIdHash,
        thresholdMinC,
        thresholdMaxC,
        windowStart,
        windowEnd,
        complianceFlag,
        envMerkleRoot,
        readings,
      });

      const signerRole = req.user?.role || 'ADMIN';
      const now = Date.now();
      const job = await txQueue.enqueue({
        type: 'ANCHOR_ENV',
        payload: {
          lotIdHash: leg.lotIdHash,
          legId,
          envMerkleRoot,
          windowStart,
          windowEnd,
          complianceFlag,
          zkProof: '0x01',
          timestamp: Math.floor(now / 1000),
          signerRole,
        },
        metadata: { legId, lotIdHash: leg.lotIdHash, complianceFlag },
      });

      await db.ref(`cold-chain-legs/${legId}`).update({
        status: 'SEALING',
        envMerkleRoot,
        windowStart,
        windowEnd,
        complianceFlag,
        sealedCid: ipfsResult?.cid,
        processingJobId: job.id,
        sealedAt: now,
        updatedAt: now,
      });

      res.json({
        success: true,
        data: { legId, envMerkleRoot, windowStart, windowEnd, complianceFlag, readingCount: readings.length, sealedCid: ipfsResult?.cid, jobId: job.id },
      });
    } catch (error: any) {
      Logger.error('Seal cold-chain leg error', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: { code: error.code || 'SEAL_LEG_ERROR', message: getErrorMessage(error, 'Failed to seal cold-chain leg') },
      });
    }
  }
);

/**
 * GET /coldchain/legs
 * Optional ?lotIdHash= filter.
 */
router.get('/legs', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const lotIdHash = String(req.query.lotIdHash || '').trim();
    const snapshot = lotIdHash
      ? await db.ref('cold-chain-legs').orderByChild('lotIdHash').equalTo(lotIdHash).once('value')
      : await db.ref('cold-chain-legs').once('value');

    const legs = Object.values(snapshot.val() || {}) as any[];
    legs.sort((a, b) => (b.createdAt || b.openedAt || 0) - (a.createdAt || a.openedAt || 0));

    res.json({ success: true, data: legs });
  } catch (error) {
    Logger.error('Get cold-chain legs error', error);
    res.status(500).json({ success: false, error: { code: 'GET_LEGS_ERROR', message: 'Failed to fetch cold-chain legs' } });
  }
});

/**
 * GET /coldchain/legs/:legId
 * Includes the leg record plus its live/sealed readings.
 */
router.get('/legs/:legId', verifyToken, validateRequest({ params: legParamsSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const { legId } = req.params;
    const [legSnapshot, readingsSnapshot] = await Promise.all([
      db.ref(`cold-chain-legs/${legId}`).once('value'),
      db.ref(`cold-chain-readings/${legId}`).once('value'),
    ]);

    if (!legSnapshot.exists()) {
      return res.status(404).json({ success: false, error: { code: 'LEG_NOT_FOUND', message: `Cold-chain leg ${legId} not found` } });
    }

    const readings = Object.values(readingsSnapshot.val() || {}) as any[];
    readings.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

    res.json({ success: true, data: { ...legSnapshot.val(), readings } });
  } catch (error) {
    Logger.error('Get cold-chain leg error', error);
    res.status(500).json({ success: false, error: { code: 'GET_LEG_ERROR', message: 'Failed to fetch cold-chain leg' } });
  }
});

export default router;

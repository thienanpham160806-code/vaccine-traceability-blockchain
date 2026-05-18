import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';

const router = Router();

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

router.get('/risk-flags', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.ref('risk-flags').once('value');
    res.json({ success: true, data: Object.values(snapshot.val() || {}) });
  } catch (error) {
    Logger.error('Get risk flags error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAGS_ERROR', message: 'Failed to fetch risk flags' } });
  }
});

router.get('/recalls', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.ref('recalls').once('value');
    res.json({ success: true, data: Object.values(snapshot.val() || {}) });
  } catch (error) {
    Logger.error('Get recalls error', error);
    res.status(500).json({ success: false, error: { code: 'RECALLS_ERROR', message: 'Failed to fetch recalls' } });
  }
});

router.post('/recalls', async (req: Request, res: Response) => {
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
    const serialHashes = serials.map((serial: string) => toBytes32(serial));
    const txHash = await contractClient.recallBatch(normalizedBatchHash, reasonHash, serialHashes);
    const now = Date.now();
    const recall = {
      id: normalizedBatchHash,
      batchHash: normalizedBatchHash,
      reason,
      reasonHash,
      authorityAddress: contractClient.getRoleAddress('MANUFACTURER'),
      serialsAffected: serialHashes.length,
      txHash,
      createdAt: now,
    };

    const updates: Record<string, unknown> = {
      [`recalls/${normalizedBatchHash}`]: recall,
      [`batches/${normalizedBatchHash}/recalledAt`]: now,
      [`batches/${normalizedBatchHash}/updatedAt`]: now,
    };

    serialHashes.forEach((serialHash) => {
      updates[`products/${serialHash}/status`] = 'RECALLED';
      updates[`products/${serialHash}/riskLevel`] = 'CRITICAL';
      updates[`products/${serialHash}/updatedAt`] = now;
    });

    await db.ref().update(updates);
    res.json({ success: true, data: recall });
  } catch (error) {
    Logger.error('Create recall error', error);
    res.status(500).json({ success: false, error: { code: 'RECALL_ERROR', message: 'Failed to recall batch' } });
  }
});

router.get('/disputes', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.ref('disputes').once('value');
    res.json({ success: true, data: Object.values(snapshot.val() || {}) });
  } catch (error) {
    Logger.error('Get disputes error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTES_ERROR', message: 'Failed to fetch disputes' } });
  }
});

router.post('/disputes', async (req: Request, res: Response) => {
  try {
    const { relatedSerialId, reportedBy = 'demo-user', reason, evidenceIpfsCid } = req.body;

    if (!relatedSerialId || !reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: relatedSerialId, reason',
        },
      });
    }

    const now = Date.now();
    const id = `DISPUTE-${now}`;
    const dispute = {
      id,
      relatedSerialId,
      reportedBy,
      status: 'OPEN',
      reason,
      evidenceIpfsCid,
      createdAt: now,
      updatedAt: now,
    };

    await db.ref(`disputes/${id}`).set(dispute);
    res.json({ success: true, data: dispute });
  } catch (error) {
    Logger.error('Create dispute error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_ERROR', message: 'Failed to create dispute' } });
  }
});

export default router;

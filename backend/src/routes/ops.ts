import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';

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

router.get('/risk-flags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const snapshot = await db.ref(`risk-flags/${id}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'RISK_FLAG_NOT_FOUND', message: `Risk flag ${id} not found` },
      });
    }

    res.json({ success: true, data: snapshot.val() });
  } catch (error) {
    Logger.error('Get risk flag detail error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAG_ERROR', message: 'Failed to fetch risk flag' } });
  }
});

router.put('/risk-flags/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note = '', resolvedBy = 'dashboard-user' } = req.body;
    const snapshot = await db.ref(`risk-flags/${id}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'RISK_FLAG_NOT_FOUND', message: `Risk flag ${id} not found` },
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
    res.json({ success: true, data: { ...snapshot.val(), ...updates } });
  } catch (error) {
    Logger.error('Resolve risk flag error', error);
    res.status(500).json({ success: false, error: { code: 'RISK_FLAG_RESOLVE_ERROR', message: 'Failed to resolve risk flag' } });
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
    const serialHashes = serials.map((serial: string) => toBytes32(serial));
    const txHash = await contractClient.recallBatch(normalizedBatchHash, reasonHash, 'RECALL_AUTHORITY');
    const now = Date.now();
    const recall = {
      id: normalizedBatchHash,
      batchHash: normalizedBatchHash,
      reason,
      reasonHash,
      authorityAddress: req.user?.address || contractClient.getRoleAddress('RECALL_AUTHORITY'),
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

router.get('/disputes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const snapshot = await db.ref(`disputes/${id}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    res.json({ success: true, data: snapshot.val() });
  } catch (error) {
    Logger.error('Get dispute detail error', error);
    res.status(500).json({ success: false, error: { code: 'DISPUTE_DETAIL_ERROR', message: 'Failed to fetch dispute' } });
  }
});

router.put('/disputes/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, note = '', updatedBy = 'dashboard-user' } = req.body;
    const allowedStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DISPUTE_STATUS',
          message: `status must be one of: ${allowedStatuses.join(', ')}`,
        },
      });
    }

    const snapshot = await db.ref(`disputes/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    const now = Date.now();
    const dispute = snapshot.val();
    const statusHistory = Array.isArray(dispute.statusHistory) ? dispute.statusHistory : [];
    const updates = {
      status,
      statusNote: String(note || '').trim(),
      updatedBy,
      updatedAt: now,
      closedAt: status === 'RESOLVED' || status === 'REJECTED' ? now : dispute.closedAt || null,
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

router.post('/disputes/:id/evidence', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type = 'NOTE', title = 'Evidence', value, addedBy = 'dashboard-user' } = req.body;

    if (!value || typeof value !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EVIDENCE', message: 'value is required' },
      });
    }

    const snapshot = await db.ref(`disputes/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: `Dispute ${id} not found` },
      });
    }

    const now = Date.now();
    const dispute = snapshot.val();
    const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
    const evidenceItem = {
      id: `EVIDENCE-${now}`,
      type,
      title,
      value: value.trim(),
      addedBy,
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

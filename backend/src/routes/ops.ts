import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth';

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
    const dispute: any = {
      id,
      relatedSerialId,
      reportedBy,
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

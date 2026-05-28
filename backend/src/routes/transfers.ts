import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { TransferRecord } from '../types';
import { validateRequest } from '../middleware/validation';
import {
  transferConfirmSchema,
  transferIdParamsSchema,
  transferRejectSchema,
  transferScanSchema,
} from '../schemas/transferSchemas';

const router = Router();
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function toBytes32(value?: string): string {
  if (!value) return ZERO_BYTES32;
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function getErrorMessage(error: any, fallback: string): string {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

/**
 * GET /transfers
 * List all transfer records from Firebase
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.ref('transfers').once('value');
    const data = snapshot.val() || {};
    const transfers = Object.values(data) as TransferRecord[];

    transfers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ success: true, data: transfers });
  } catch (error) {
    Logger.error('Get transfers error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_TRANSFERS_ERROR', message: 'Failed to fetch transfers' },
    });
  }
});

/**
 * GET /transfers/:transferId
 * Get single transfer by ID
 */
router.get('/:transferId', validateRequest({ params: transferIdParamsSchema }), async (req: Request, res: Response) => {
  try {
    const { transferId } = req.params;
    const snapshot = await db.ref(`transfers/${transferId}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: { code: 'TRANSFER_NOT_FOUND', message: `Transfer ${transferId} not found` },
      });
    }

    res.json({ success: true, data: snapshot.val() });
  } catch (error) {
    Logger.error('Get transfer error', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_TRANSFER_ERROR', message: 'Failed to fetch transfer' },
    });
  }
});

/**
 * POST /transfers/scan
 * Create transfer request (Scan QR to initiate delivery)
 */
router.post('/scan', validateRequest({ body: transferScanSchema }), async (req: Request, res: Response) => {
  try {
    const {
      serialId,
      receiverAddress: rawReceiverAddress,
      fromRole,
      toRole,
      fromLocationHash,
      toLocationHash,
    } = req.body;

    if (!serialId || !fromRole || !toRole) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, fromRole, toRole',
        },
      });
    }

    const receiverAddress = rawReceiverAddress || contractClient.getRoleAddress(toRole);

    if (!CryptoUtils.isValidAddress(receiverAddress)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RECEIVER',
          message: 'receiverAddress must be a valid Ethereum address',
        },
      });
    }

    Logger.info(`Transfer scan for: ${serialId}`);

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'CONTRACTS_NOT_READY',
          message: 'Smart contracts are not initialized',
        },
      });
    }

    const serialHash = toBytes32(serialId);
    const senderAddress = contractClient.getRoleAddress(fromRole);
    const fromLoc = toBytes32(fromLocationHash || `from:${senderAddress}`);
    const toLoc = toBytes32(toLocationHash || `to:${receiverAddress}`);
    const txHash = await contractClient.createTransferRequest(
      serialHash,
      receiverAddress,
      fromLoc,
      toLoc,
      fromRole
    );

    const now = Date.now();
    const transferId = `${serialHash}_${now}`;
    const ipfsResult = await ipfsService.pinJson(`transfer-${serialId}-${now}`, {
      serialId,
      serialHash,
      sender: senderAddress,
      receiver: receiverAddress,
      fromRole,
      toRole,
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      status: 'PENDING',
      blockchainTx: txHash,
      createdAt: now,
    });

    const transfer: TransferRecord & { blockchainTx?: string } = {
      id: transferId,
      serialId,
      batchId: req.body.batchId || '',
      fromAddress: senderAddress,
      toAddress: receiverAddress,
      fromRole,
      toRole,
      status: 'PENDING',
      fromLocationHash: fromLoc,
      toLocationHash: toLoc,
      ipfsCid: ipfsResult?.cid,
      blockchainTx: txHash,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`transfers/${transferId}`).set(transfer),
      db.ref(`products/${serialHash}`).update({
        status: 'PENDING_DELIVERY',
        currentOwner: senderAddress,
        updatedAt: now,
      }),
    ]);

    res.json({
      success: true,
      data: {
        transfer,
        serialHash,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Transfer scan error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_SCAN_ERROR',
        message: getErrorMessage(error, 'Failed to create transfer'),
      },
    });
  }
});

/**
 * POST /transfers/confirm
 * Confirm transfer (Receiver accepts delivery)
 */
router.post('/confirm', validateRequest({ body: transferConfirmSchema }), async (req: Request, res: Response) => {
  try {
    const { serialId, receiverLocationHash } = req.body;

    if (!serialId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required field: serialId',
        },
      });
    }

    Logger.info(`Transfer confirm for: ${serialId}`);

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'CONTRACTS_NOT_READY',
          message: 'Smart contracts are not initialized',
        },
      });
    }

    const serialHash = toBytes32(serialId);
    const transfersSnapshot = await db.ref('transfers').once('value');
    const transfers = transfersSnapshot.val() || {};
    const pendingEntry = Object.entries(transfers).find(([, transfer]) => {
      const t = transfer as TransferRecord;
      return t.serialId === serialId && t.status === 'PENDING';
    });

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PENDING_TRANSFER_NOT_FOUND',
          message: `No pending transfer found for ${serialId}`,
        },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry as [string, TransferRecord];
    const locationHash = toBytes32(receiverLocationHash || pendingTransfer.toLocationHash);
    const txHash = await contractClient.confirmTransfer(serialHash, locationHash, pendingTransfer.toRole);
    const now = Date.now();

    await Promise.all([
      db.ref(`transfers/${transferId}`).update({
        status: 'CONFIRMED',
        confirmedAt: now,
        blockchainTx: txHash,
        updatedAt: now,
      }),
      db.ref(`products/${serialHash}`).update({
        status: 'DELIVERED',
        currentOwner: pendingTransfer.toAddress,
        updatedAt: now,
      }),
    ]);

    res.json({
      success: true,
      data: {
        transferId,
        serialId,
        serialHash,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Transfer confirm error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_CONFIRM_ERROR',
        message: getErrorMessage(error, 'Failed to confirm transfer'),
      },
    });
  }
});

/**
 * POST /transfers/reject
 * Reject transfer — reverts product status on-chain via rejectTransfer()
 */
router.post('/reject', validateRequest({ body: transferRejectSchema }), async (req: Request, res: Response) => {
  try {
    const { serialId, rejectionReason } = req.body;

    if (!serialId || !rejectionReason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, rejectionReason',
        },
      });
    }

    Logger.info(`Transfer reject for: ${serialId}`);

    if (!contractClient.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'CONTRACTS_NOT_READY',
          message: 'Smart contracts are not initialized',
        },
      });
    }

    const serialHash = toBytes32(serialId);
    const transfersSnapshot = await db.ref('transfers').once('value');
    const transfers = transfersSnapshot.val() || {};
    const pendingEntry = Object.entries(transfers).find(([, transfer]) => {
      const t = transfer as TransferRecord;
      return t.serialId === serialId && t.status === 'PENDING';
    });

    if (!pendingEntry) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PENDING_TRANSFER_NOT_FOUND',
          message: `No pending transfer found for ${serialId}`,
        },
      });
    }

    const [transferId, pendingTransfer] = pendingEntry as [string, TransferRecord];

    // Call smart contract — receiver role signs the rejection
    const txHash = await contractClient.rejectTransfer(serialHash, rejectionReason, pendingTransfer.toRole);
    const now = Date.now();

    await Promise.all([
      db.ref(`transfers/${transferId}`).update({
        status: 'REJECTED',
        rejectedReason: rejectionReason,
        rejectedAt: now,
        blockchainTx: txHash,
        updatedAt: now,
      }),
      db.ref(`products/${serialHash}`).update({
        status: 'VERIFIED',
        updatedAt: now,
      }),
    ]);

    res.json({
      success: true,
      data: {
        transferId,
        serialId,
        serialHash,
        rejectionReason,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Transfer reject error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSFER_REJECT_ERROR',
        message: getErrorMessage(error, 'Failed to reject transfer'),
      },
    });
  }
});

export default router;

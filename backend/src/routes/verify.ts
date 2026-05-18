import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { CryptoUtils } from '../utils/crypto';
import { TransferRecord, VerifyResult } from '../types';

const router = Router();

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

/**
 * GET /verify/:serialId
 * Verify vaccine authenticity and get full timeline
 */
router.get('/:serialId', async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Verifying product: ${serialId}`);

    // Get product info
    const serialHash = toBytes32(serialId);
    let productSnapshot = await db.ref(`products/${serialHash}`).once('value');

    if (!productSnapshot.exists()) {
      productSnapshot = await db.ref(`products/${serialId}`).once('value');
    }

    if (!productSnapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product ${serialId} not found`,
        },
      });
    }

    const product = productSnapshot.val();

    // Get batch info
    const batchRef = db.ref(`batches/${product.batchHash || product.batchId}`);
    const batchSnapshot = await batchRef.once('value');
    const batch = batchSnapshot.val();

    // Get transfer timeline
    const transfersRef = db.ref('transfers');
    const transfersSnapshot = await transfersRef.once('value');
    const allTransfers = transfersSnapshot.val() || {};
    const timeline = Object.values(allTransfers).filter(
      (transfer: any) => transfer.serialId === serialId || transfer.serialId === serialHash
    ) as TransferRecord[];

    const verifyResult: VerifyResult = {
      product,
      batch,
      timeline,
      recallStatus: batch?.recalledAt ? true : false,
      zkProofVerified: product?.zkpVerified || false,
    };

    Logger.success(`Verified product: ${serialId}`);

    res.json({
      success: true,
      data: verifyResult,
    });
  } catch (error) {
    Logger.error('Verify product error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFY_ERROR',
        message: 'Failed to verify product',
      },
    });
  }
});

/**
 * GET /consumer/verify/:serialId
 * Public verify endpoint (no auth required)
 */
router.get('/consumer/:serialId', async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Consumer verify: ${serialId}`);

    // Same as /verify but with limited data for public access
    const serialHash = toBytes32(serialId);
    let productSnapshot = await db.ref(`products/${serialHash}`).once('value');

    if (!productSnapshot.exists()) {
      productSnapshot = await db.ref(`products/${serialId}`).once('value');
    }

    if (!productSnapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product ${serialId} not found`,
        },
      });
    }

    const product = productSnapshot.val();
    const batchRef = db.ref(`batches/${product.batchHash || product.batchId}`);
    const batchSnapshot = await batchRef.once('value');
    const batch = batchSnapshot.val();

    // Limited data for public
    const publicData = {
      serialId: product.serialId,
      productName: batch?.productName,
      status: product.status,
      isRecalled: batch?.recalledAt ? true : false,
      expiryDate: batch?.expiryDate,
    };

    res.json({
      success: true,
      data: publicData,
    });
  } catch (error) {
    Logger.error('Consumer verify error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFY_ERROR',
        message: 'Failed to verify product',
      },
    });
  }
});

export default router;

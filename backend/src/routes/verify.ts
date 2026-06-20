import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { CryptoUtils } from '../utils/crypto';
import { TransferRecord, VerifyResult } from '../types';
import {
  findBatchForPayload,
  findProductForLookup,
  parseVerifyLookup,
  productBelongsToBatch,
} from '../utils/verifyLookup';

const router = Router();

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

async function resolveProduct(lookupValue: string) {
  const lookup = parseVerifyLookup(lookupValue);
  if (!lookup) return null;

  if (lookup.kind === 'identifier') {
    const lookupHash = toBytes32(lookup.value);
    let productSnapshot = await db.ref(`products/${lookupHash}`).once('value');
    if (productSnapshot.exists()) {
      return {
        product: productSnapshot.val(),
        lookupHash,
        lookupValue: lookup.value,
      };
    }

    productSnapshot = await db.ref(`products/${lookup.value}`).once('value');
    if (productSnapshot.exists()) {
      const product = productSnapshot.val();
      return {
        product,
        lookupHash: product.serialHash || lookupHash,
        lookupValue: lookup.value,
      };
    }

    const indexSnapshot = await db.ref(`serial-index/${lookup.value}`).once('value');
    const indexedHash = indexSnapshot.val();
    if (typeof indexedHash === 'string' && indexedHash.length > 0) {
      productSnapshot = await db.ref(`products/${indexedHash}`).once('value');
      if (productSnapshot.exists()) {
        return {
          product: productSnapshot.val(),
          lookupHash: indexedHash,
          lookupValue: lookup.value,
        };
      }
    }
  }

  const productsSnapshot = await db.ref('products').once('value');
  const products = Object.values(productsSnapshot.val() || {}) as any[];
  let product = findProductForLookup(products, lookup);

  if (!product && lookup.kind === 'batchPayload') {
    const batchesSnapshot = await db.ref('batches').once('value');
    const batches = Object.values(batchesSnapshot.val() || {}) as any[];
    const batch = findBatchForPayload(batches, lookup);

    if (batch) {
      product = products.find((item: any) => productBelongsToBatch(item, batch));
    }
  }

  if (!product) return null;

  return {
    product,
    lookupHash: product.serialHash || toBytes32(product.serialId || lookup.value),
    lookupValue: product.serialId || lookup.value,
  };
}

async function buildVerifyResult(lookupValue: string): Promise<VerifyResult | null> {
  const resolved = await resolveProduct(lookupValue);
  if (!resolved) return null;

  const { product, lookupHash, lookupValue: normalizedLookup } = resolved;

  const batchRef = db.ref(`batches/${product.batchHash || product.batchId}`);
  const batchSnapshot = await batchRef.once('value');
  const batch = batchSnapshot.val();

  const transfersRef = db.ref('transfers');
  const transfersSnapshot = await transfersRef.once('value');
  const allTransfers = transfersSnapshot.val() || {};
  const timeline = Object.values(allTransfers).filter((transfer: any) => {
    return (
      transfer.serialId === normalizedLookup ||
      transfer.serialId === lookupHash ||
      transfer.serialId === product.serialId ||
      transfer.serialHash === lookupHash
    );
  }) as TransferRecord[];

  return {
    product,
    batch,
    timeline,
    recallStatus: batch?.recalledAt ? true : false,
    zkProofVerified: product?.zkpVerified || false,
  };
}

/**
 * GET /verify/:serialId
 * Verify vaccine authenticity and get full timeline
 */
router.get('/:serialId', async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Verifying product: ${serialId}`);

    const verifyResult = await buildVerifyResult(serialId);
    if (!verifyResult) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product ${serialId} not found`,
        },
      });
    }

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

    const publicData = await buildVerifyResult(serialId);
    if (!publicData) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product ${serialId} not found`,
        },
      });
    }

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

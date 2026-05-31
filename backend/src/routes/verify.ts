import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { CryptoUtils } from '../utils/crypto';
import { TransferRecord, VerifyResult } from '../types';

const router = Router();

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function normalizeLookupValue(value: string): string {
  const decodedValue = decodeURIComponent(value).trim();

  try {
    const parsedUrl = new URL(decodedValue);
    const marker = '/consumer/verify/';
    const markerIndex = parsedUrl.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length)).trim();
    }
  } catch {
    // The lookup can be a plain serial, batch hash, or QR payload instead of a URL.
  }

  return decodedValue;
}

async function resolveProduct(lookupValue: string) {
  const decodedValue = normalizeLookupValue(lookupValue);
  const [qrBatchHash, qrMetadataHash] = decodedValue.split('/').map((part) => part?.trim()).filter(Boolean);
  const lookupHash = toBytes32(decodedValue);

  let productSnapshot = await db.ref(`products/${lookupHash}`).once('value');
  if (productSnapshot.exists()) {
    return {
      product: productSnapshot.val(),
      lookupHash,
      lookupValue: decodedValue,
    };
  }

  productSnapshot = await db.ref(`products/${decodedValue}`).once('value');
  if (productSnapshot.exists()) {
    const product = productSnapshot.val();
    return {
      product,
      lookupHash: product.serialHash || lookupHash,
      lookupValue: decodedValue,
    };
  }

  const indexSnapshot = await db.ref(`serial-index/${decodedValue}`).once('value');
  const indexedHash = indexSnapshot.val();
  if (indexedHash) {
    productSnapshot = await db.ref(`products/${indexedHash}`).once('value');
    if (productSnapshot.exists()) {
      return {
        product: productSnapshot.val(),
        lookupHash: indexedHash,
        lookupValue: decodedValue,
      };
    }
  }

  const productsSnapshot = await db.ref('products').once('value');
  const products = Object.values(productsSnapshot.val() || {}) as any[];

  let product = products.find((item: any) => {
    return (
      item?.serialId === decodedValue ||
      item?.serialHash === decodedValue ||
      item?.batchId === decodedValue ||
      item?.batchHash === decodedValue ||
      item?.metadataHash === decodedValue
    );
  });

  if (!product && qrBatchHash) {
    product = products.find((item: any) => {
      return (
        item?.batchHash === qrBatchHash ||
        item?.batchId === qrBatchHash ||
        item?.metadataHash === qrMetadataHash
      );
    });
  }

  if (!product && (qrBatchHash || qrMetadataHash)) {
    const batchesSnapshot = await db.ref('batches').once('value');
    const batches = Object.values(batchesSnapshot.val() || {}) as any[];
    const batch = batches.find((item: any) => {
      return (
        item?.batchHash === qrBatchHash ||
        item?.id === qrBatchHash ||
        item?.batchQR === qrBatchHash ||
        item?.metadataHash === qrMetadataHash
      );
    });

    if (batch) {
      product = products.find((item: any) => item?.batchHash === batch.batchHash || item?.batchId === batch.id);
    }
  }

  if (!product) return null;

  return {
    product,
    lookupHash: product.serialHash || toBytes32(product.serialId || decodedValue),
    lookupValue: product.serialId || decodedValue,
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

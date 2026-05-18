import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { CryptoUtils } from '../utils/crypto';
import { QRCodeGenerator } from '../utils/qr';
import { Logger } from '../utils/logger';
import { Batch, Product } from '../types';

const router = Router();
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function getErrorMessage(error: any, fallback: string): string {
  return error?.shortMessage || error?.reason || error?.message || fallback;
}

/**
 * GET /products
 * List all products
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    Logger.info('Fetching products list');

    const productsRef = db.ref('products');
    const snapshot = await productsRef.once('value');
    const productsData = snapshot.val() || {};

    const products: Product[] = Object.values(productsData);

    Logger.info(`Retrieved ${products.length} products`);

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    Logger.error('Get products error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRODUCTS_ERROR',
        message: 'Failed to fetch products',
      },
    });
  }
});

/**
 * GET /products/:serialId
 * Get product by serial ID
 */
router.get('/:serialId', async (req: Request, res: Response) => {
  try {
    const { serialId } = req.params;

    Logger.info(`Fetching product: ${serialId}`);

    const productKey = toBytes32(serialId);
    const productRef = db.ref(`products/${productKey}`);
    let snapshot = await productRef.once('value');

    if (!snapshot.exists()) {
      snapshot = await db.ref(`products/${serialId}`).once('value');
    }

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with serial ID ${serialId} not found`,
        },
      });
    }

    const product = snapshot.val() as Product;

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    Logger.error('Get product error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRODUCT_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

/**
 * POST /products/register
 * Register new product (batch)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      serialId,
      batchId,
      batchHash: rawBatchHash,
      metadataHash: rawMetadataHash,
      productName,
      manufacturerName = 'Unknown manufacturer',
      manufacturerAddress,
      expiryDate,
      quantity = 1,
      origin = 'MANUFACTURED',
      importDocHash: rawImportDocHash,
      zkpProof,
    } = req.body;

    if (!serialId || !productName || !expiryDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: serialId, productName, expiryDate',
        },
      });
    }

    Logger.info(`Registering product: ${serialId}`);

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
    const batchQR = batchId || QRCodeGenerator.generateBatchId();
    const batchHash = rawBatchHash ? toBytes32(rawBatchHash) : toBytes32(batchQR);
    const metadataPayload = {
      serialId,
      serialHash,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: manufacturerAddress || contractClient.getWalletAddress(),
      expiryDate,
      quantity,
      origin,
      createdAt: Date.now(),
    };
    const metadataHash = rawMetadataHash
      ? toBytes32(rawMetadataHash)
      : toBytes32(JSON.stringify(metadataPayload));
    const importDocHash = rawImportDocHash ? toBytes32(rawImportDocHash) : ZERO_BYTES32;
    const proofBytes = zkpProof || '0x';
    const signerRole = origin === 'IMPORTED' ? 'IMPORTER' : 'MANUFACTURER';
    const qrContent = QRCodeGenerator.encodeQRContent(batchHash, metadataHash);
    const qrImage = await QRCodeGenerator.generateQRImage(qrContent);
    const ipfsResult = await ipfsService.pinJson(`batch-${batchQR}-${serialId}`, {
      ...metadataPayload,
      metadataHash,
      qrContent,
    });

    const txHash = await contractClient.registerProduct(
      serialHash,
      batchHash,
      metadataHash,
      importDocHash,
      proofBytes,
      signerRole
    );

    const now = Date.now();
    const batch: Batch = {
      id: batchQR,
      batchHash,
      batchQR,
      metadataHash,
      productName,
      quantity,
      manufacturerAddress: manufacturerAddress || contractClient.getRoleAddress(signerRole),
      manufacturerName,
      expiryDate,
      origin: origin === 'IMPORTED' ? 'IMPORTED' : 'MANUFACTURED',
      ipfsCid: ipfsResult?.cid,
      createdAt: now,
      updatedAt: now,
    };

    const product: Product = {
      serialId,
      batchId: batchQR,
      batchHash,
      productName,
      manufacturerName,
      manufacturerAddress: batch.manufacturerAddress,
      currentOwner: contractClient.getRoleAddress(signerRole),
      status: 'VERIFIED',
      riskLevel: 'SAFE',
      expiryDate,
      isImported: origin === 'IMPORTED',
      zkpVerified: Boolean(zkpProof && importDocHash !== ZERO_BYTES32),
      blockchainTx: txHash,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      db.ref(`batches/${batchHash}`).update(batch),
      db.ref(`products/${serialHash}`).set(product),
      db.ref(`serial-index/${serialId}`).set(serialHash),
    ]);

    res.json({
      success: true,
      data: {
        product,
        batch,
        batchHash,
        metadataHash,
        serialHash,
        ipfsCid: ipfsResult?.cid,
        qrContent,
        qrImage,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Register product error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTER_ERROR',
        message: getErrorMessage(error, 'Failed to register product'),
      },
    });
  }
});

export default router;

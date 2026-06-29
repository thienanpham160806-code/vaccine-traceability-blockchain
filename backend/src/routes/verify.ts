import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { CryptoUtils } from '../utils/crypto';
import { contractClient } from '../contracts/client';
import { assessRisk } from '../services/riskEngine';
import {
  OrganizationProfile,
  PublicOrganizationProfile,
  SupplyChainNode,
  TransferRecord,
  User,
  VerifyResult,
} from '../types';
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

function normalizeAddress(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function publicOrganizationProfile(org?: OrganizationProfile | null): PublicOrganizationProfile | null {
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    code: org.code,
    address: org.address,
    licenseNumber: org.licenseNumber,
    facilityType: org.facilityType,
    storageCapacity: org.storageCapacity,
    coldChainCapability: org.coldChainCapability,
    isActive: org.isActive,
  };
}

function formatTemperatureRange(transfer: TransferRecord): string | undefined {
  const unit = transfer.temperatureUnit || 'C';
  if (transfer.temperatureMinC === undefined && transfer.temperatureMaxC === undefined) return undefined;
  if (transfer.temperatureMinC !== undefined && transfer.temperatureMaxC !== undefined) {
    return `${transfer.temperatureMinC} - ${transfer.temperatureMaxC} °${unit}`;
  }
  if (transfer.temperatureMinC !== undefined) return `>= ${transfer.temperatureMinC} °${unit}`;
  return `<= ${transfer.temperatureMaxC} °${unit}`;
}

function sortTimeline(timeline: TransferRecord[]) {
  return [...timeline].sort((a, b) => {
    const left = a.createdAt || a.confirmedAt || a.updatedAt || 0;
    const right = b.createdAt || b.confirmedAt || b.updatedAt || 0;
    return left - right;
  });
}

function resolveOrganization(
  address: string | undefined,
  role: string | undefined,
  users: User[],
  organizations: OrganizationProfile[]
) {
  const normalizedAddress = normalizeAddress(address);
  const user = users.find((item: any) => {
    return normalizeAddress(item.address || item.walletAddress) === normalizedAddress;
  });

  const byUserOrg = user?.organizationId
    ? organizations.find((org) => org.id === user.organizationId)
    : null;
  if (byUserOrg) return byUserOrg;

  const byWallet = organizations.find((org) => normalizeAddress(org.walletAddress) === normalizedAddress);
  if (byWallet) return byWallet;

  return organizations.find((org) => String(org.type || '').toUpperCase() === String(role || '').toUpperCase()) || null;
}

function buildSupplyChainNodes(
  timeline: TransferRecord[],
  users: User[],
  organizations: OrganizationProfile[],
  product: any
): SupplyChainNode[] {
  const nodes = new Map<string, SupplyChainNode>();

  const upsertNode = (
    address: string | undefined,
    role: string | undefined,
    transfer: TransferRecord,
    direction: 'from' | 'to'
  ) => {
    const normalizedAddress = normalizeAddress(address);
    const key = `${role || 'UNKNOWN'}:${normalizedAddress || direction}:${transfer.id}`;
    const org = resolveOrganization(address, role, users, organizations);
    const publicOrg = publicOrganizationProfile(org);
    const existing = nodes.get(key);
    const technicalDetails = {
      txHash: transfer.blockchainTx,
      blockchainTx: transfer.blockchainTx,
      ipfsCid: transfer.ipfsCid,
      fromLocationHash: transfer.fromLocationHash,
      toLocationHash: transfer.toLocationHash,
      fromAddress: transfer.fromAddress,
      toAddress: transfer.toAddress,
    };

    nodes.set(key, {
      ...(existing || {}),
      id: key,
      role: role || 'UNKNOWN',
      walletAddress: address,
      organization: publicOrg,
      organizationName: publicOrg?.name,
      organizationCode: publicOrg?.code,
      licenseNumber: publicOrg?.licenseNumber,
      addressOrRegion: publicOrg?.address,
      facilityType: publicOrg?.facilityType,
      warehouseName: direction === 'from' ? transfer.fromWarehouseName : transfer.toWarehouseName,
      locationName: direction === 'from' ? transfer.fromLocationName : transfer.toLocationName,
      departedAt: direction === 'from' ? transfer.departedAt || transfer.createdAt : undefined,
      arrivedAt: direction === 'to' ? transfer.arrivedAt || transfer.confirmedAt || transfer.updatedAt : undefined,
      temperatureRange: formatTemperatureRange(transfer),
      status: transfer.status,
      transferId: transfer.id,
      carrierName: transfer.carrierName,
      vehicleId: transfer.vehicleId,
      handlingNotes: transfer.handlingNotes,
      technicalDetails,
    });
  };

  for (const transfer of sortTimeline(timeline)) {
    upsertNode(transfer.fromAddress, transfer.fromRole, transfer, 'from');
    upsertNode(transfer.toAddress, transfer.toRole, transfer, 'to');
  }

  if (nodes.size === 0 && product?.manufacturerAddress) {
    const org = resolveOrganization(product.manufacturerAddress, 'MANUFACTURER', users, organizations);
    const publicOrg = publicOrganizationProfile(org);
    nodes.set(`MANUFACTURER:${normalizeAddress(product.manufacturerAddress)}`, {
      id: `MANUFACTURER:${normalizeAddress(product.manufacturerAddress)}`,
      role: 'MANUFACTURER',
      walletAddress: product.manufacturerAddress,
      organization: publicOrg,
      organizationName: publicOrg?.name || product.manufacturerName,
      organizationCode: publicOrg?.code,
      licenseNumber: publicOrg?.licenseNumber,
      addressOrRegion: publicOrg?.address,
      facilityType: publicOrg?.facilityType,
      status: product.status,
      technicalDetails: {
        blockchainTx: product.blockchainTx,
        txHash: product.blockchainTx,
        fromAddress: product.manufacturerAddress,
      },
    });
  }

  return Array.from(nodes.values());
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
  const timeline = sortTimeline(Object.values(allTransfers).filter((transfer: any) => {
    return (
      transfer.serialId === normalizedLookup ||
      transfer.serialId === lookupHash ||
      transfer.serialId === product.serialId ||
      transfer.serialHash === lookupHash
    );
  }) as TransferRecord[]);

  const [usersSnapshot, organizationsSnapshot] = await Promise.all([
    db.ref('users').once('value'),
    db.ref('organizations').once('value'),
  ]);
  const users = Object.values(usersSnapshot.val() || {}) as User[];
  const organizations = Object.values(organizationsSnapshot.val() || {}) as OrganizationProfile[];
  const supplyChainNodes = buildSupplyChainNodes(timeline, users, organizations, product);

  // On-chain verification
  let onChainVerified = false;
  let metadataHashMatch = false;
  let onChainStatus: string | null = null;
  let lastScan: { timestamp: number; locationHash: string } | null = null;
  let risk = assessRisk(product, batch);

  try {
    if (contractClient.isInitialized() && lookupHash) {
      const [onChain, rawLastScan] = await Promise.all([
        contractClient.getProduct(lookupHash).catch(() => null),
        contractClient.transferLedger?.lastScans(lookupHash).catch(() => null),
      ]);

      if (onChain?.exists) {
        const fbHash  = String(product?.metadataHash || '').toLowerCase();
        const ocHash  = String(onChain.metadataHash  || '').toLowerCase();
        metadataHashMatch = fbHash !== '' && fbHash === ocHash;
        onChainVerified   = metadataHashMatch;

        const statusMap: Record<number, string> = {
          0: 'REGISTERED', 1: 'VERIFIED', 2: 'IN_TRANSIT',
          3: 'DELIVERED', 4: 'FLAGGED', 5: 'RECALLED',
        };
        onChainStatus = statusMap[Number(onChain.status)] ?? null;

        if (onChainStatus) {
          const firebaseStatus = String(product?.status || '').toUpperCase();
          const effectiveStatus = firebaseStatus === 'ADMINISTERED' ? firebaseStatus : onChainStatus;
          risk = assessRisk({ ...product, status: effectiveStatus }, batch);
        }
      }

      if (rawLastScan && Number(rawLastScan[0]) > 0) {
        lastScan = {
          timestamp:    Number(rawLastScan[0]) * 1000,
          locationHash: String(rawLastScan[1]),
        };
      }
    }
  } catch {
    // Non-blocking
  }

  return {
    product,
    batch,
    timeline,
    supplyChainNodes,
    recallStatus: batch?.recalledAt ? true : false,
    zkProofVerified: product?.zkpVerified || false,
    onChainVerified,
    metadataHashMatch,
    onChainStatus,
    lastScan,
    risk,
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

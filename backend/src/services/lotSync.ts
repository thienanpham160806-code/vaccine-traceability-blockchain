import { db } from '../config/firebase';
import { Logger } from '../utils/logger';

/**
 * Fan-out helpers for lot-level on-chain confirmations that need to patch
 * every unit (`products/{unitIdHash}`) belonging to a lot. Shared between
 * txQueue's optimistic confirm path and eventListener's authoritative
 * on-chain-event path so the two never drift into different Firebase
 * shapes for the same outcome.
 *
 * A lot can carry thousands of units, so updates are chunked instead of
 * sent as one giant multi-path db.ref().update() call.
 */

const CHUNK_SIZE = 500;

async function chunkedUpdate(updates: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = Object.fromEntries(entries.slice(i, i + CHUNK_SIZE));
    await db.ref().update(chunk);
  }
}

async function getUnitIdHashesForLot(lotIdHash: string): Promise<string[]> {
  const snapshot = await db.ref('products').orderByChild('lotIdHash').equalTo(lotIdHash).once('value');
  const result: string[] = [];
  snapshot.forEach((child) => {
    if (child.key) result.push(child.key);
    return false;
  });
  return result;
}

export async function markLotUnitsVerified(lotIdHash: string, txHash: string): Promise<number> {
  try {
    const unitIdHashes = await getUnitIdHashesForLot(lotIdHash);
    if (unitIdHashes.length === 0) return 0;

    const now = Date.now();
    const updates: Record<string, unknown> = {};
    for (const unitIdHash of unitIdHashes) {
      updates[`products/${unitIdHash}/status`] = 'VERIFIED';
      updates[`products/${unitIdHash}/syncStatus`] = 'OK';
      updates[`products/${unitIdHash}/blockchainTx`] = txHash;
      updates[`products/${unitIdHash}/processingJobId`] = null;
      updates[`products/${unitIdHash}/updatedAt`] = now;
    }

    await chunkedUpdate(updates);
    return unitIdHashes.length;
  } catch (error) {
    Logger.warn(`Could not mark units verified for lot ${lotIdHash}`, error);
    return 0;
  }
}

export async function markLotUnitsRecalled(lotIdHash: string, reasonHash: string, txHash: string): Promise<number> {
  try {
    const unitIdHashes = await getUnitIdHashesForLot(lotIdHash);
    if (unitIdHashes.length === 0) return 0;

    const now = Date.now();
    const updates: Record<string, unknown> = {};
    for (const unitIdHash of unitIdHashes) {
      updates[`products/${unitIdHash}/status`] = 'RECALLED';
      updates[`products/${unitIdHash}/flagReason`] = reasonHash;
      updates[`products/${unitIdHash}/syncStatus`] = 'OK';
      updates[`products/${unitIdHash}/blockchainTx`] = txHash;
      updates[`products/${unitIdHash}/updatedAt`] = now;
    }

    await chunkedUpdate(updates);
    return unitIdHashes.length;
  } catch (error) {
    Logger.warn(`Could not mark units recalled for lot ${lotIdHash}`, error);
    return 0;
  }
}

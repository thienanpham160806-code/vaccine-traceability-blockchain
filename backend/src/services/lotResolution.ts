import { db } from '../config/firebase';

export interface ResolvedRootLot {
  rootLotIdHash: string;
  aggregationRoot: string;
  lotSalt: string | null;
  unitLeaves: string[];
  recalled: boolean;
}

/**
 * Walks a lotIdHash up through sub-lots/ (parentLotIdHash chain, supporting
 * multi-tier disaggregation) until it reaches the root batches/ record.
 *
 * This matters because the on-chain authenticity check
 * (ProductRegistry.decommissionUnit) picks its Merkle root by whichever
 * `lotIdHash` is passed in: the lot's own `aggregationRoot` if it's a
 * top-level commissioned lot, or `lotToSubRoot[lotIdHash]` (the sub-lot's
 * OWN, smaller, backend-trusted root) if it isn't. A sub-lot's root is not
 * independently verified on-chain to be a subset of its parent's leaves —
 * so dispensing MUST always resolve to the root ancestor and build the
 * proof against ITS full original unitLeaves + pass ITS lotIdHash, never a
 * sub-lot's. This is what actually delivers the spec's stated guarantee
 * ("a unit smuggled into a sub-lot fails its proof against the root") —
 * it only holds if this resolution step is never skipped.
 */
export async function resolveRootLot(lotIdHash: string): Promise<ResolvedRootLot | null> {
  let currentId = lotIdHash;
  const visited = new Set<string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (visited.has(currentId)) return null; // cycle guard against corrupt data
    visited.add(currentId);

    const batchSnap = await db.ref(`batches/${currentId}`).once('value');
    if (batchSnap.exists()) {
      const batch = batchSnap.val();
      return {
        rootLotIdHash: currentId,
        aggregationRoot: batch.aggregationRoot,
        lotSalt: batch.lotSalt || null,
        unitLeaves: Array.isArray(batch.unitLeaves) ? batch.unitLeaves : [],
        recalled: Boolean(batch.recalledAt),
      };
    }

    const subLotSnap = await db.ref(`sub-lots/${currentId}`).once('value');
    if (subLotSnap.exists()) {
      const subLot = subLotSnap.val();
      if (!subLot.parentLotIdHash) return null;
      currentId = subLot.parentLotIdHash;
      continue;
    }

    return null;
  }
}

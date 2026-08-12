import { ethers } from 'ethers';

/**
 * Minimal Merkle tree implementation matching OpenZeppelin's
 * MerkleProof.verify() semantics exactly (sorted-pair keccak256; an odd
 * node at any level is promoted unchanged to the next level). This is what
 * ProductRegistry.decommissionUnit() verifies on-chain, so proofs built
 * here must reconstruct to the same root the contract checks against.
 *
 * No merkletreejs dependency — the algorithm is short enough to keep
 * in-house and trivially auditable against the Solidity library it mirrors.
 */

export interface BuiltMerkleTree {
  root: string;
  leaves: string[];
  layers: string[][];
}

function hashPair(a: string, b: string): string {
  const [lo, hi] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([lo as `0x${string}`, hi as `0x${string}`]));
}

export class MerkleService {
  /**
   * Build a tree from an ordered list of leaf hashes (each already a
   * bytes32 hex string, e.g. CryptoUtils.hashWithSalt(serialId, lotSalt)).
   */
  build(leaves: string[]): BuiltMerkleTree {
    if (!leaves.length) {
      throw new Error('Cannot build a merkle tree from zero leaves');
    }

    for (const leaf of leaves) {
      if (!/^0x[a-fA-F0-9]{64}$/.test(leaf)) {
        throw new Error(`Invalid merkle leaf (expected bytes32 hex): ${leaf}`);
      }
    }

    let layer = [...leaves];
    const layers: string[][] = [layer];

    while (layer.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
      layers.push(layer);
    }

    return { root: layer[0], leaves: [...leaves], layers };
  }

  /**
   * Build the inclusion proof for one leaf. Throws if the leaf isn't part
   * of the tree (callers should treat that as a data-integrity bug, not a
   * normal "not found" case — every unit committed to a lot must appear).
   */
  getProof(tree: BuiltMerkleTree, leaf: string): string[] {
    let index = tree.layers[0].indexOf(leaf);
    if (index === -1) {
      throw new Error(`Leaf not found in merkle tree: ${leaf}`);
    }

    const proof: string[] = [];
    for (let level = 0; level < tree.layers.length - 1; level++) {
      const layerAtLevel = tree.layers[level];
      const siblingIndex = index % 2 === 1 ? index - 1 : index + 1;
      if (siblingIndex < layerAtLevel.length) {
        proof.push(layerAtLevel[siblingIndex]);
      }
      index = Math.floor(index / 2);
    }

    return proof;
  }

  /**
   * Off-chain re-check mirroring the on-chain verify — useful to fail fast
   * with a clear error before spending gas on a doomed decommissionUnit tx.
   */
  verify(root: string, leaf: string, proof: string[]): boolean {
    let computed = leaf;
    for (const sibling of proof) {
      computed = hashPair(computed, sibling);
    }
    return computed.toLowerCase() === root.toLowerCase();
  }
}

export const merkleService = new MerkleService();
export default merkleService;

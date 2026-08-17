import { MerkleService } from '../../src/services/merkle';

describe('MerkleService', () => {
  let merkleService: MerkleService;

  beforeEach(() => {
    merkleService = new MerkleService();
  });

  describe('build', () => {
    it('should build a merkle tree from a single leaf', () => {
      const leaves = ['0x0000000000000000000000000000000000000000000000000000000000000001'];
      const tree = merkleService.build(leaves);

      expect(tree.root).toBe(leaves[0]);
      expect(tree.leaves).toEqual(leaves);
      expect(tree.layers).toHaveLength(1);
      expect(tree.layers[0]).toEqual(leaves);
    });

    it('should build a merkle tree from two leaves', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      ];
      const tree = merkleService.build(leaves);

      expect(tree.root).toBeDefined();
      expect(tree.root).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(tree.leaves).toEqual(leaves);
      expect(tree.layers).toHaveLength(2);
      expect(tree.layers[0]).toEqual(leaves);
      expect(tree.layers[1]).toHaveLength(1);
    });

    it('should build a merkle tree from four leaves', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];
      const tree = merkleService.build(leaves);

      expect(tree.root).toBeDefined();
      expect(tree.leaves).toEqual(leaves);
      expect(tree.layers).toHaveLength(3); // leaves -> 2 nodes -> 1 root
      expect(tree.layers[0]).toEqual(leaves);
      expect(tree.layers[1]).toHaveLength(2);
      expect(tree.layers[2]).toHaveLength(1);
    });

    it('should build a merkle tree with odd number of leaves', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
      ];
      const tree = merkleService.build(leaves);

      expect(tree.root).toBeDefined();
      expect(tree.layers).toHaveLength(3); // leaves -> 2 nodes (last promoted) -> 1 root
    });

    it('should throw error for empty leaves', () => {
      expect(() => merkleService.build([])).toThrow('Cannot build a merkle tree from zero leaves');
    });

    it('should throw error for invalid leaf format', () => {
      expect(() => merkleService.build(['invalid'])).toThrow('Invalid merkle leaf');
      expect(() => merkleService.build(['0x123'])).toThrow('Invalid merkle leaf');
      expect(() => merkleService.build(['not-hex-at-all'])).toThrow('Invalid merkle leaf');
    });

    it('should handle large number of leaves', () => {
      const leaves: string[] = [];
      for (let i = 0; i < 100; i++) {
        leaves.push('0x' + String(i).padStart(64, '0'));
      }
      const tree = merkleService.build(leaves);

      expect(tree.root).toBeDefined();
      expect(tree.leaves).toHaveLength(100);
      expect(tree.layers[0]).toHaveLength(100);
      // Last layer should have at least 1 node
      expect(tree.layers[tree.layers.length - 1]).toHaveLength(1);
    });
  });

  describe('getProof', () => {
    it('should generate correct proof for first leaf', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];
      const tree = merkleService.build(leaves);
      const proof = merkleService.getProof(tree, leaves[0]);

      expect(proof).toBeDefined();
      expect(Array.isArray(proof)).toBe(true);
      expect(proof.length).toBeGreaterThan(0);
      expect(proof.every((p: string) => /^0x[a-fA-F0-9]{64}$/.test(p))).toBe(true);
    });

    it('should generate correct proof for middle leaf', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];
      const tree = merkleService.build(leaves);
      const proof = merkleService.getProof(tree, leaves[2]);

      expect(proof).toBeDefined();
      expect(Array.isArray(proof)).toBe(true);
    });

    it('should generate proof with increasing length as tree grows', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];

      const proofs: string[][] = [];
      for (let i = 0; i < leaves.length; i++) {
        const partialTree = merkleService.build(leaves.slice(0, i + 1));
        proofs.push(merkleService.getProof(partialTree, leaves[i]));
      }

      for (let i = 1; i < proofs.length; i++) {
        expect(proofs[i].length).toBeGreaterThanOrEqual(proofs[i - 1].length);
      }
    });

    it('should throw error for leaf not in tree', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      ];
      const tree = merkleService.build(leaves);

      expect(() => merkleService.getProof(tree, '0x' + 'ff'.repeat(32))).toThrow('Leaf not found in merkle tree');
    });
  });

  describe('verify', () => {
    it('should verify valid proof', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];
      const tree = merkleService.build(leaves);

      for (const leaf of leaves) {
        const proof = merkleService.getProof(tree, leaf);
        const isValid = merkleService.verify(tree.root, leaf, proof);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid proof', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      ];
      const tree = merkleService.build(leaves);
      const wrongProof = ['0x' + 'ff'.repeat(32)];

      const isValid = merkleService.verify(tree.root, leaves[0], wrongProof);
      expect(isValid).toBe(false);
    });

    it('should reject proof with wrong leaf', () => {
      const leaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ];
      const tree = merkleService.build(leaves);
      const proof = merkleService.getProof(tree, leaves[0]);

      const isValid = merkleService.verify(tree.root, leaves[2], proof);
      expect(isValid).toBe(false);
    });

    it('should be case insensitive for root comparison', () => {
      const leaves = ['0x' + 'a'.repeat(64), '0x' + 'b'.repeat(64)];
      const tree = merkleService.build(leaves);
      const proof = merkleService.getProof(tree, leaves[0]);

      const upperRoot = tree.root.toUpperCase();
      const lowerRoot = tree.root.toLowerCase();

      expect(merkleService.verify(upperRoot, leaves[0], proof)).toBe(true);
      expect(merkleService.verify(lowerRoot, leaves[0], proof)).toBe(true);
    });

    it('should handle single leaf verification', () => {
      const leaves = ['0x0000000000000000000000000000000000000000000000000000000000000001'];
      const tree = merkleService.build(leaves);

      const isValid = merkleService.verify(tree.root, leaves[0], []);
      expect(isValid).toBe(true);
    });
  });

  describe('end-to-end lot-merkle workflow', () => {
    it('should simulate lot commissioning and unit dispensing', () => {
      // Simulate 10 units in a lot
      const unitLeaves: string[] = [];
      for (let i = 0; i < 10; i++) {
        unitLeaves.push('0x' + String(i).padStart(64, '0'));
      }

      // Build tree (simulates lot commissioning)
      const tree = merkleService.build(unitLeaves);
      expect(tree.root).toBeDefined();

      // Verify and dispense each unit
      for (let i = 0; i < unitLeaves.length; i++) {
        const proof = merkleService.getProof(tree, unitLeaves[i]);
        const isValid = merkleService.verify(tree.root, unitLeaves[i], proof);
        expect(isValid).toBe(true);
      }
    });

    it('should detect tampered unit', () => {
      const unitLeaves = [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
      ];
      const tree = merkleService.build(unitLeaves);

      // Tamper with a leaf
      const tamperedLeaf = '0x' + 'ff'.repeat(32);
      const proof = merkleService.getProof(tree, unitLeaves[0]);
      const isValid = merkleService.verify(tree.root, tamperedLeaf, proof);

      expect(isValid).toBe(false);
    });
  });
});

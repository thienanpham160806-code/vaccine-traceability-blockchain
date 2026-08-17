import { CryptoUtils } from '../../src/utils/crypto';

describe('CryptoUtils', () => {
  describe('keccak256', () => {
    it('should produce 0x-prefixed 64-char hex string', () => {
      const hash = CryptoUtils.keccak256('test');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const input = 'hello world';
      const hash1 = CryptoUtils.keccak256(input);
      const hash2 = CryptoUtils.keccak256(input);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = CryptoUtils.keccak256('input1');
      const hash2 = CryptoUtils.keccak256('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = CryptoUtils.keccak256('');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should handle unicode characters', () => {
      const hash = CryptoUtils.keccak256('Tiếng Việt');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('sha256', () => {
    it('should produce 64-char hex string (without 0x)', () => {
      const hash = CryptoUtils.sha256('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const input = 'hello world';
      const hash1 = CryptoUtils.sha256(input);
      const hash2 = CryptoUtils.sha256(input);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = CryptoUtils.sha256('input1');
      const hash2 = CryptoUtils.sha256('input2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('randomHash', () => {
    it('should produce 0x-prefixed 64-char hex string', () => {
      const hash = CryptoUtils.randomHash();
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce unique hashes', () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        hashes.add(CryptoUtils.randomHash());
      }
      expect(hashes.size).toBe(100);
    });
  });

  describe('encodeLocation', () => {
    it('should encode lat,lng into a hash', () => {
      const hash = CryptoUtils.encodeLocation('10.762622', '106.660172');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const hash1 = CryptoUtils.encodeLocation('10.762622', '106.660172');
      const hash2 = CryptoUtils.encodeLocation('10.762622', '106.660172');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different locations', () => {
      const hash1 = CryptoUtils.encodeLocation('10.762622', '106.660172');
      const hash2 = CryptoUtils.encodeLocation('10.762623', '106.660172');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashWithSalt', () => {
    it('should produce 0x-prefixed 64-char hex string', () => {
      const hash = CryptoUtils.hashWithSalt('serial123', 'salt456');
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
      const hash1 = CryptoUtils.hashWithSalt('serial123', 'salt456');
      const hash2 = CryptoUtils.hashWithSalt('serial123', 'salt456');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes with different values', () => {
      const hash1 = CryptoUtils.hashWithSalt('serial123', 'salt456');
      const hash2 = CryptoUtils.hashWithSalt('serial124', 'salt456');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes with different salts', () => {
      const hash1 = CryptoUtils.hashWithSalt('serial123', 'salt456');
      const hash2 = CryptoUtils.hashWithSalt('serial123', 'salt457');
      expect(hash1).not.toBe(hash2);
    });

    it('should match lot-merkle pattern: hashWithSalt(serialId, lotSalt)', () => {
      const serialId = 'LOT001-001';
      const lotSalt = '0x1234567890abcdef';
      const hash = CryptoUtils.hashWithSalt(serialId, lotSalt);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('decodeQRContent', () => {
    it('should decode valid QR content', () => {
      const result = CryptoUtils.decodeQRContent('batchHash/metadataHash');
      expect(result).toEqual({
        batchHash: 'batchHash',
        metadataHash: 'metadataHash',
      });
    });

    it('should decode QR with slashes in values', () => {
      const result = CryptoUtils.decodeQRContent('batch/hash/with/slashes/metaHash');
      expect(result).toEqual({
        batchHash: 'batch',
        metadataHash: 'hash',
      });
    });

    it('should handle QR content without metadata hash', () => {
      const result = CryptoUtils.decodeQRContent('onlyBatch');
      expect(result).toEqual({
        batchHash: 'onlyBatch',
        metadataHash: undefined,
      });
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(CryptoUtils.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5')).toBe(true);
      expect(CryptoUtils.isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(CryptoUtils.isValidAddress('0xABCDEF1234567890abcdef1234567890abcdef12')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(CryptoUtils.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e')).toBe(false); // too short
      expect(CryptoUtils.isValidAddress('742d35Cc6634C0532925a3b844Bc9e7595f0d5e5')).toBe(false); // missing 0x
      expect(CryptoUtils.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e55')).toBe(false); // too long
      expect(CryptoUtils.isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5g')).toBe(false); // invalid char
      expect(CryptoUtils.isValidAddress('')).toBe(false);
    });
  });

  describe('isValidHash', () => {
    it('should validate correct hash format', () => {
      expect(CryptoUtils.isValidHash('0x' + 'a'.repeat(64))).toBe(true);
      expect(CryptoUtils.isValidHash('0x' + 'A'.repeat(64))).toBe(true);
      expect(CryptoUtils.isValidHash('0x' + '0'.repeat(64))).toBe(true);
      expect(CryptoUtils.isValidHash('0x' + 'f'.repeat(64))).toBe(true);
    });

    it('should reject invalid hash format', () => {
      expect(CryptoUtils.isValidHash('0x' + 'a'.repeat(63))).toBe(false); // too short
      expect(CryptoUtils.isValidHash('0x' + 'a'.repeat(65))).toBe(false); // too long
      expect(CryptoUtils.isValidHash('a'.repeat(64))).toBe(false); // missing 0x
      expect(CryptoUtils.isValidHash('0x' + 'g'.repeat(64))).toBe(false); // invalid char
      expect(CryptoUtils.isValidHash('')).toBe(false);
      expect(CryptoUtils.isValidHash('0x123')).toBe(false);
    });
  });

  describe('integration: CryptoUtils + MerkleService', () => {
    it('should generate merkle leaves from serialIds with lotSalt', () => {
      const lotSalt = '0x' + 'a'.repeat(64);
      const serialIds = ['LOT001-001', 'LOT001-002', 'LOT001-003'];
      const leaves = serialIds.map((serialId) => CryptoUtils.hashWithSalt(serialId, lotSalt));

      expect(leaves).toHaveLength(3);
      expect(leaves.every((leaf) => CryptoUtils.isValidHash(leaf))).toBe(true);
      expect(new Set(leaves).size).toBe(3); // all unique
    });
  });
});

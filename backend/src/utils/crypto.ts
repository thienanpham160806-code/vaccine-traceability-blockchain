import crypto from 'crypto';
import { ethers } from 'ethers';

export class CryptoUtils {
  /**
   * Keccak256 hash (matching Solidity)
   */
  static keccak256(data: string): string {
    return ethers.id(data);
  }

  /**
   * SHA256 hash
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate random hash (bytes32 format)
   */
  static randomHash(): string {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encode location into hash
   * @param lat Latitude
   * @param lng Longitude
   */
  static encodeLocation(lat: string, lng: string): string {
    const data = `${lat},${lng}`;
    return this.keccak256(data);
  }

  /**
   * Salted hash — pseudonymizes a value so it can be published on-chain
   * without being trivially dictionary-attacked back to the original
   * (e.g. serialId formats are predictable, so plain keccak256(serialId)
   * lets anyone map hashes back to serials). NOT the same salt concept as
   * the ZKP commitment-blinding `salt` used in importZkp.ts/the import
   * circuit — that salt hides one field inside a zero-knowledge proof,
   * this one just pseudonymizes an otherwise-public identifier.
   *
   * Two salts are used across the codebase:
   * - lotSalt: one random salt per lot (batches/{lotIdHash}.lotSalt), used
   *   to derive every serial's unitIdHash within that lot.
   * - systemSalt: one shared salt (env SYSTEM_SALT), used for actor/location
   *   hashes since those identities recur across many lots.
   */
  static hashWithSalt(value: string, salt: string): string {
    return this.keccak256(`${value}:${salt}`);
  }

  /**
   * Decode QR content (batchHash/metadataHash)
   */
  static decodeQRContent(content: string): { batchHash: string; metadataHash: string } {
    const parts = content.split('/');
    return {
      batchHash: parts[0],
      metadataHash: parts[1],
    };
  }

  /**
   * Verify Ethereum address format
   */
  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Verify hash format (0x followed by 64 hex chars)
   */
  static isValidHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }
}

export default CryptoUtils;

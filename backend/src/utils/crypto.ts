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

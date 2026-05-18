import QRCode from 'qrcode';
import crypto from 'crypto';

export class QRCodeGenerator {
  /**
   * Generate batch QR code ID
   * Format: BATCH-{MANUFACTURER_CODE}-{TIMESTAMP}-{RANDOM_HASH}
   * Example: BATCH-VCN-1716518400000-a1b2c3
   */
  static generateBatchId(manufacturerCode: string = 'VCN'): string {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `BATCH-${manufacturerCode}-${timestamp}-${hash}`;
  }

  /**
   * Encode batch info into QR content
   * Content format: {batchHash}/{metadataHash}
   */
  static encodeQRContent(batchHash: string, metadataHash: string): string {
    return `${batchHash}/${metadataHash}`;
  }

  /**
   * Generate QR code image (base64 data URL)
   * Can be displayed directly in img src
   */
  static async generateQRImage(content: string): Promise<string> {
    try {
      const dataUrl = await QRCode.toDataURL(content, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 2,
        width: 300,
      } as any);
      return dataUrl; // base64 data URL: data:image/png;base64,...
    } catch (error) {
      console.error('QR code generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Decode batch ID to extract info
   */
  static decodeBatchId(batchId: string): { manufacturerCode: string; timestamp: number; hash: string } {
    const parts = batchId.split('-');
    if (parts.length < 4) {
      throw new Error('Invalid batch ID format');
    }
    return {
      manufacturerCode: parts[1],
      timestamp: parseInt(parts[2]),
      hash: parts[3],
    };
  }

  /**
   * Validate batch ID format
   */
  static isValidBatchId(batchId: string): boolean {
    const pattern = /^BATCH-[A-Z0-9]+-\d+-[A-F0-9]+$/;
    return pattern.test(batchId);
  }
}

export default QRCodeGenerator;

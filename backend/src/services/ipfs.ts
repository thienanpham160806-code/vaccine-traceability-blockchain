import axios from 'axios';
import config from '../config/env';
import { Logger } from '../utils/logger';

export interface PinJsonResult {
  cid: string;
  size?: number;
  timestamp?: string;
}

export class IpfsService {
  private readonly endpoint = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

  isConfigured(): boolean {
    return Boolean(config.pinataJwt);
  }

  async pinJson(name: string, data: unknown): Promise<PinJsonResult | null> {
    if (!this.isConfigured()) {
      Logger.warn('PINATA_JWT is not configured; skipping IPFS pin');
      return null;
    }

    try {
      const response = await axios.post(
        this.endpoint,
        {
          pinataMetadata: { name },
          pinataContent: data,
        },
        {
          headers: {
            Authorization: `Bearer ${config.pinataJwt}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }
      );

      return {
        cid: response.data.IpfsHash,
        size: response.data.PinSize,
        timestamp: response.data.Timestamp,
      };
    } catch (error) {
      Logger.warn('IPFS pin failed; continuing without CID', error);
      return null;
    }
  }
}

export const ipfsService = new IpfsService();
export default ipfsService;

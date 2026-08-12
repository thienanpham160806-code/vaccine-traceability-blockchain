import { ethers } from 'ethers';
import axios from 'axios';
import { devicesService } from './devices';
import { Logger } from '../utils/logger';

export interface SimulateLegOptions {
  deviceId?: string;
  count?: number;
  thresholdMinC?: number;
  thresholdMaxC?: number;
  excursionProbability?: number;
  startTimestamp?: number; // unix seconds
  intervalSeconds?: number;
  apiBaseUrl?: string;
}

export interface SimulateLegResult {
  deviceId: string;
  address: string;
  sent: number;
  failed: number;
  excursions: number;
}

/**
 * Mức 1 cold-chain simulator: mints a throwaway device identity (fresh
 * ECDSA key-pair, registered by address only), generates a series of
 * readings around a threshold band with occasional excursions, and POSTs
 * each one through the real /coldchain/readings HTTP endpoint — exercising
 * the actual signature-verification path end-to-end rather than writing
 * Firebase directly. A real device (e.g. ESP32) later posts to this same
 * endpoint with its own firmware-held key; nothing downstream changes.
 */
export class ColdChainSimService {
  async simulateLegReadings(legId: string, options: SimulateLegOptions = {}): Promise<SimulateLegResult> {
    const {
      count = 12,
      thresholdMinC = 2,
      thresholdMaxC = 8,
      excursionProbability = 0.1,
      intervalSeconds = 300,
      apiBaseUrl = process.env.COLD_CHAIN_SIM_API_URL || 'http://localhost:5000',
    } = options;

    const deviceId = options.deviceId || `SIM-${legId.slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}`;
    const wallet = ethers.Wallet.createRandom();
    await devicesService.registerDevice(deviceId, wallet.address, `Simulator for leg ${legId}`, 'SIMULATOR');

    const startTimestamp = options.startTimestamp ?? Math.floor(Date.now() / 1000) - count * intervalSeconds;

    let sent = 0;
    let failed = 0;
    let excursions = 0;

    for (let i = 0; i < count; i++) {
      const timestamp = startTimestamp + i * intervalSeconds;
      const isExcursion = Math.random() < excursionProbability;
      const temperatureC = isExcursion
        ? this.randomOutOfRange(thresholdMinC, thresholdMaxC)
        : this.randomInRange(thresholdMinC, thresholdMaxC);
      const humidityPct = this.randomInRange(40, 65);

      const payload = devicesService.canonicalReadingPayload({ legId, deviceId, timestamp, temperatureC });
      const signature = await wallet.signMessage(payload);

      try {
        await axios.post(`${apiBaseUrl}/coldchain/readings`, {
          legId,
          deviceId,
          timestamp,
          temperatureC,
          humidityPct,
          signature,
        });
        sent += 1;
        if (isExcursion) excursions += 1;
      } catch (error: any) {
        failed += 1;
        Logger.warn(`Simulator failed to post reading ${i} for leg ${legId}`, error?.response?.data || error?.message || error);
      }
    }

    return { deviceId, address: wallet.address, sent, failed, excursions };
  }

  private randomInRange(min: number, max: number): number {
    return Math.round((min + Math.random() * (max - min)) * 10) / 10;
  }

  private randomOutOfRange(min: number, max: number): number {
    const span = Math.max(max - min, 1);
    const below = Math.random() < 0.5;
    return below
      ? Math.round((min - span * 0.5 - Math.random() * span * 0.5) * 10) / 10
      : Math.round((max + span * 0.5 + Math.random() * span * 0.5) * 10) / 10;
  }
}

export const coldChainSimService = new ColdChainSimService();
export default coldChainSimService;

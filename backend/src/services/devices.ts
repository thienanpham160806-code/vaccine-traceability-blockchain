import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';

/**
 * Device registry for cold-chain sensor sources (simulator today, real
 * hardware — e.g. ESP32 — later, unchanged API). Only ever stores a public
 * address, never a private key.
 */
export interface DeviceRecord {
  deviceId: string;
  address: string;
  label?: string;
  type: 'SIMULATOR' | 'HARDWARE';
  createdAt: number;
  updatedAt: number;
}

export class DevicesService {
  async registerDevice(deviceId: string, address: string, label?: string, type: DeviceRecord['type'] = 'SIMULATOR'): Promise<DeviceRecord> {
    const now = Date.now();
    const existing = await this.getDevice(deviceId);
    const record: DeviceRecord = {
      deviceId,
      address: ethers.getAddress(address),
      label: label || existing?.label,
      type,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await db.ref(`devices/${deviceId}`).set(record);
    return record;
  }

  async getDevice(deviceId: string): Promise<DeviceRecord | null> {
    const snapshot = await db.ref(`devices/${deviceId}`).once('value');
    return snapshot.exists() ? (snapshot.val() as DeviceRecord) : null;
  }

  /**
   * Canonical reading payload — MUST match exactly what the simulator (or
   * real device firmware later) signs. See schemas/coldchain.ts for the
   * documented limitation that humidity/gps aren't covered.
   */
  canonicalReadingPayload(reading: { legId: string; deviceId: string; timestamp: number; temperatureC: number }): string {
    return JSON.stringify({
      legId: reading.legId,
      deviceId: reading.deviceId,
      timestamp: reading.timestamp,
      temperatureC: reading.temperatureC,
    });
  }

  /**
   * Verifies an ECDSA signature (ethers signMessage/verifyMessage) over the
   * canonical reading payload against the device's registered address.
   */
  async verifyReadingSignature(
    reading: { legId: string; deviceId: string; timestamp: number; temperatureC: number },
    signature: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const device = await this.getDevice(reading.deviceId);
    if (!device) {
      return { valid: false, reason: `Unknown device: ${reading.deviceId}` };
    }

    try {
      const payload = this.canonicalReadingPayload(reading);
      const recovered = ethers.verifyMessage(payload, signature);
      if (recovered.toLowerCase() !== device.address.toLowerCase()) {
        return { valid: false, reason: 'Signature does not match the registered device address' };
      }
      return { valid: true };
    } catch (error) {
      Logger.warn(`Failed to verify reading signature for device ${reading.deviceId}`, error);
      return { valid: false, reason: 'Malformed signature' };
    }
  }
}

export const devicesService = new DevicesService();
export default devicesService;

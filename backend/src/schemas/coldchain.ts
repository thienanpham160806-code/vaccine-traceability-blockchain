import { z } from 'zod';

const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const signaturePattern = /^0x[a-fA-F0-9]+$/;

const legId = z.string().trim().regex(bytes32Pattern, 'legId must be a 32-byte hex string');
const deviceId = z.string().trim().min(1, 'deviceId is required').max(120, 'deviceId is too long');

export const legParamsSchema = z.object({
  legId,
});

/**
 * A single sensor reading. The canonical signed payload is
 * JSON.stringify({ legId, deviceId, timestamp, temperatureC }) — humidity/gps
 * are recorded but NOT covered by the signature at this "Mức 1 mô phỏng"
 * stage (documented limitation, not a bug: extending the signed payload
 * later is backward compatible for anyone re-verifying old readings since
 * the reading itself, not just the signature, is stored).
 */
export const coldChainReadingSchema = z.object({
  legId,
  deviceId,
  timestamp: z.coerce.number().int('timestamp must be an integer').positive('timestamp must be positive'),
  temperatureC: z.coerce.number().min(-50, 'temperatureC is too low').max(60, 'temperatureC is too high'),
  humidityPct: z.coerce.number().min(0).max(100).optional(),
  gpsLat: z.coerce.number().min(-90).max(90).optional(),
  gpsLng: z.coerce.number().min(-180).max(180).optional(),
  signature: z.string().trim().regex(signaturePattern, 'signature must be a hex string'),
});

export const sealLegSchema = z.object({
  legId,
});

export const registerDeviceSchema = z.object({
  deviceId,
  address: z.string().trim().regex(addressPattern, 'address must be an Ethereum address'),
  label: z.string().trim().max(160, 'label is too long').optional(),
});

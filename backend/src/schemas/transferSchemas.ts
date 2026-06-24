import { z } from 'zod';

const idPattern = /^[A-Za-z0-9._:-]+$/;
const ethAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;

const serialId = z
  .string({ message: 'serialId must be a string' })
  .trim()
  .min(3, 'serialId is required')
  .max(128, 'serialId is too long')
  .regex(idPattern, 'serialId can only contain letters, numbers, dot, underscore, colon, or dash');

const initiatorRole = z.enum(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR']);
const receiverRole = z.enum(['DISTRIBUTOR', 'CLINIC', 'PHARMACY']);
const allowedTransferRoutes: Record<z.infer<typeof initiatorRole>, Array<z.infer<typeof receiverRole>>> = {
  MANUFACTURER: ['DISTRIBUTOR'],
  IMPORTER: ['DISTRIBUTOR'],
  DISTRIBUTOR: ['CLINIC', 'PHARMACY'],
};

const optionalLocationHash = z
  .string()
  .trim()
  .regex(bytes32Pattern, 'location hash must be a 32-byte hex string')
  .optional();

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long`).optional();

const optionalTimestamp = z.coerce
  .number()
  .int('timestamp must be an integer')
  .min(0, 'timestamp must be positive')
  .optional();

const optionalTemperature = z.coerce
  .number()
  .min(-100, 'temperature is too low')
  .max(100, 'temperature is too high')
  .optional();

export const transferIdParamsSchema = z.object({
  transferId: z.string().trim().min(1, 'transferId is required').max(240, 'transferId is too long'),
});

export const transferScanSchema = z
  .object({
    serialId,
    receiverAddress: z.string().trim().regex(ethAddressPattern, 'receiverAddress must be an Ethereum address').optional(),
    fromRole: initiatorRole,
    toRole: receiverRole,
    batchId: z.string().trim().max(128, 'batchId is too long').optional(),
    fromLocationHash: optionalLocationHash,
    toLocationHash: optionalLocationHash,
    fromLocation: z.string().trim().max(200, 'fromLocation is too long').optional(),
    fromLocationName: optionalText(200, 'fromLocationName'),
    toLocationName: optionalText(200, 'toLocationName'),
    fromWarehouseName: optionalText(200, 'fromWarehouseName'),
    toWarehouseName: optionalText(200, 'toWarehouseName'),
    carrierName: optionalText(160, 'carrierName'),
    vehicleId: optionalText(80, 'vehicleId'),
    departedAt: optionalTimestamp,
    arrivedAt: optionalTimestamp,
    temperatureMinC: optionalTemperature,
    temperatureMaxC: optionalTemperature,
    temperatureUnit: z.enum(['C', 'F']).optional(),
    handlingNotes: optionalText(1000, 'handlingNotes'),
  })
  .refine((value) => allowedTransferRoutes[value.fromRole].includes(value.toRole), {
    path: ['toRole'],
    message: 'Transfer route is not allowed by the route matrix',
  })
  .refine((value) => {
    if (value.departedAt === undefined || value.arrivedAt === undefined) return true;
    return value.arrivedAt >= value.departedAt;
  }, {
    path: ['arrivedAt'],
    message: 'arrivedAt must be after departedAt',
  })
  .refine((value) => {
    if (value.temperatureMinC === undefined || value.temperatureMaxC === undefined) return true;
    return value.temperatureMaxC >= value.temperatureMinC;
  }, {
    path: ['temperatureMaxC'],
    message: 'temperatureMaxC must be greater than or equal to temperatureMinC',
  });

export const transferConfirmSchema = z.object({
  serialId,
  receiverLocationHash: optionalLocationHash,
});

export const transferRejectSchema = z.object({
  serialId,
  rejectionReason: z
    .string({ message: 'rejectionReason must be a string' })
    .trim()
    .min(1, 'rejectionReason is required')
    .max(1000, 'rejectionReason is too long'),
});

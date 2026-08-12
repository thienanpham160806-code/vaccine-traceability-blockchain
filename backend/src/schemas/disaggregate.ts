import { z } from 'zod';

const ethAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;

export const disaggregateSchema = z
  .object({
    lotId: z.string().trim().min(1, 'lotId is required').max(160, 'lotId is too long'),
    unitIdHashes: z.array(z.string().trim().regex(bytes32Pattern, 'unitIdHashes must be 32-byte hex strings')).min(1).max(10000).optional(),
    quantity: z.coerce.number().int().min(1).max(10000).optional(),
    toRole: z.enum(['DISTRIBUTOR', 'CLINIC', 'PHARMACY']),
    receiverAddress: z.string().trim().regex(ethAddressPattern, 'receiverAddress must be an Ethereum address').optional(),
  })
  .refine((value) => Boolean(value.unitIdHashes?.length) || Boolean(value.quantity), {
    message: 'Provide either unitIdHashes or quantity',
    path: ['unitIdHashes'],
  });

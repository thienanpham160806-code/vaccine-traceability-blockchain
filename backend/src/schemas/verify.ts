import { z } from 'zod';

export const dispenseSchema = z.object({
  reason: z.string().trim().max(500, 'reason is too long').optional(),
  patientToken: z.string().trim().min(8, 'patientToken is too short').max(120, 'patientToken is too long').optional(),
  niisRef: z.string().trim().max(200, 'niisRef is too long').optional(),
});

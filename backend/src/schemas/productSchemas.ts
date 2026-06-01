import { z } from 'zod';

const idPattern = /^[A-Za-z0-9._:-]+$/;
const ethAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;
const hexPattern = /^0x[a-fA-F0-9]*$/;

const trimmedString = (field: string, min = 1, max = 160) =>
  z
    .string({ message: `${field} must be a string` })
    .trim()
    .min(min, `${field} is required`)
    .max(max, `${field} is too long`);

const optionalTrimmedString = (field: string, max = 240) =>
  z
    .string({ message: `${field} must be a string` })
    .trim()
    .max(max, `${field} is too long`)
    .optional();

const dateString = z
  .string({ message: 'expiryDate must be a string' })
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'expiryDate must be a valid date',
  });

const serialId = trimmedString('serialId', 3, 128).regex(idPattern, {
  message: 'serialId can only contain letters, numbers, dot, underscore, colon, or dash',
});

const batchId = trimmedString('batchId', 3, 128).regex(idPattern, {
  message: 'batchId can only contain letters, numbers, dot, underscore, colon, or dash',
});

const optionalBytes32 = z
  .string()
  .trim()
  .regex(bytes32Pattern, 'hash must be a 32-byte hex string')
  .optional();

export const importDocumentSchema = z.object({
  docId: trimmedString('docId', 2, 120),
  importerLicense: trimmedString('importerLicense', 2, 120),
  manufacturerId: trimmedString('manufacturerId', 2, 120),
  batchNo: trimmedString('batchNo', 2, 120),
  documentExpiryDate: dateString,
  salt: trimmedString('salt', 4, 160),
  regulatorCertificateId: trimmedString('regulatorCertificateId', 2, 120),
});

export const productListQuerySchema = z.object({
  search: optionalTrimmedString('search', 120),
  status: optionalTrimmedString('status', 40),
  manufacturer: optionalTrimmedString('manufacturer', 120),
  batch: optionalTrimmedString('batch', 128),
  origin: z.enum(['MANUFACTURED', 'IMPORTED']).optional(),
  sort: z
    .string()
    .trim()
    .regex(/^(createdAt|expiryDate|status|productName|manufacturerName|batchId|batchHash|origin):(asc|desc)$/, {
      message: 'sort must be field:direction, for example createdAt:desc',
    })
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const productParamsSchema = z.object({
  serialId,
});

export const updateProductSchema = z
  .object({
    productName: optionalTrimmedString('productName', 120),
    manufacturerName: optionalTrimmedString('manufacturerName', 120),
    expiryDate: dateString.optional(),
    notes: z.string({ message: 'notes must be a string' }).trim().max(1000, 'notes is too long').optional(),
  })
  .refine(
    (value) =>
      value.productName !== undefined ||
      value.manufacturerName !== undefined ||
      value.expiryDate !== undefined ||
      value.notes !== undefined,
    {
      message: 'Provide at least one editable field',
    }
  );

export const registerProductSchema = z
  .object({
    serialId,
    batchId: batchId.optional(),
    batchHash: optionalBytes32,
    metadataHash: optionalBytes32,
    productName: trimmedString('productName', 2, 120),
    manufacturerName: optionalTrimmedString('manufacturerName', 120),
    manufacturerAddress: z.string().trim().regex(ethAddressPattern, 'manufacturerAddress must be an Ethereum address').optional(),
    expiryDate: dateString,
    quantity: z.coerce.number().int().min(1).max(10000).optional(),
    origin: z.enum(['MANUFACTURED', 'IMPORTED']).optional(),
    importDocHash: optionalBytes32,
    zkpProof: z.string().trim().regex(hexPattern, 'zkpProof must be a hex string').optional(),
    importDocument: importDocumentSchema.optional(),
  })
  .refine((value) => value.origin !== 'IMPORTED' || value.importDocument !== undefined, {
    message: 'importDocument is required for imported products',
    path: ['importDocument'],
  });

export const bulkProductItemSchema = registerProductSchema.safeExtend({
  batchId: batchId.optional(),
});

export const bulkProductsSchema = z.object({
  products: z.array(bulkProductItemSchema).min(1, 'products must contain at least one item').max(50, 'bulk limit is 50 products'),
});

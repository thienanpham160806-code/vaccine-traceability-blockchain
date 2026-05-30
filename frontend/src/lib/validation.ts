import { z } from "zod";

const idPattern = /^[A-Za-z0-9._:-]+$/;
const hexPattern = /^0x[a-fA-F0-9]*$/;

const idMessage = "Chỉ dùng chữ, số, dấu chấm, gạch dưới, dấu hai chấm hoặc gạch ngang.";

export const productRegistrationSchema = z.object({
  productName: z.string().trim().min(2, "Tên sản phẩm phải có ít nhất 2 ký tự.").max(120),
  productType: z.enum(["LOCAL", "IMPORT"]),
  batchId: z.string().trim().min(3, "Mã lô phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
  serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
  manufacturerName: z.string().trim().min(2, "Tên nhà sản xuất phải có ít nhất 2 ký tự.").max(120),
  expiryDate: z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Ngày hết hạn không hợp lệ.",
  }),
  quantity: z.coerce.number().int("Số lượng phải là số nguyên.").min(1).max(10000),
});

export const productMetadataSchema = z.object({
  productName: z.string().trim().min(2, "Tên sản phẩm phải có ít nhất 2 ký tự.").max(120),
  manufacturerName: z.string().trim().min(2, "Tên nhà sản xuất phải có ít nhất 2 ký tự.").max(120),
  expiryDate: z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Ngày hết hạn không hợp lệ.",
  }),
  notes: z.string().trim().max(1000, "Ghi chú không được vượt quá 1000 ký tự.").optional(),
});

export const bulkProductCsvSchema = z.object({
  serialId: z.string().trim().min(3, "serialId là bắt buộc.").max(128).regex(idPattern, idMessage),
  batchId: z.string().trim().max(128).regex(idPattern, idMessage).optional(),
  productName: z.string().trim().min(2, "productName là bắt buộc.").max(120),
  manufacturerName: z.string().trim().max(120).optional(),
  expiryDate: z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "expiryDate không hợp lệ.",
  }),
  origin: z.enum(["MANUFACTURED", "IMPORTED"]).optional(),
  quantity: z.coerce.number().int("quantity phải là số nguyên.").min(1).max(10000).optional(),
  importDocHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, "importDocHash phải là chuỗi hex 32-byte.").optional(),
  zkpProof: z.string().trim().regex(hexPattern, "zkpProof phải là chuỗi hex.").optional(),
});

const roleSchema = z.enum(["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "CLINIC", "PHARMACY"]);

export const transferScanFormSchema = z
  .object({
    serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
    fromRole: roleSchema,
    toRole: roleSchema,
  })
  .refine((value) => value.fromRole !== value.toRole, {
    path: ["toRole"],
    message: "Vai trò nhận phải khác vai trò gửi.",
  });

export const transferConfirmFormSchema = z.object({
  serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
});

export const transferRejectFormSchema = z.object({
  serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
  rejectionReason: z.string().trim().min(3, "Lý do từ chối phải có ít nhất 3 ký tự.").max(500),
});

export function getZodFieldErrors(error: z.ZodError) {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = String(issue.path[0] || "form");
    if (!acc[key]) acc[key] = issue.message;
    return acc;
  }, {});
}

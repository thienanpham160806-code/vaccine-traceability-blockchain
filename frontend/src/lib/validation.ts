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
  docId: z.string().trim().max(120).optional(),
  importerLicense: z.string().trim().max(120).optional(),
  manufacturerId: z.string().trim().max(120).optional(),
  documentExpiryDate: z.string().trim().optional(),
  salt: z.string().trim().max(160).optional(),
  regulatorCertificateId: z.string().trim().max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.productType !== "IMPORT") return;

  const requiredFields = ["docId", "importerLicense", "manufacturerId", "documentExpiryDate", "salt", "regulatorCertificateId"] as const;
  for (const field of requiredFields) {
    if (!value[field]) {
      ctx.addIssue({ code: "custom", path: [field], message: "Truong nay bat buoc cho vaccine nhap khau." });
    }
  }

  if (value.documentExpiryDate && Number.isNaN(new Date(value.documentExpiryDate).getTime())) {
    ctx.addIssue({ code: "custom", path: ["documentExpiryDate"], message: "Ngay het han giay to khong hop le." });
  }
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
  docId: z.string().trim().max(120).optional(),
  importerLicense: z.string().trim().max(120).optional(),
  manufacturerId: z.string().trim().max(120).optional(),
  batchNo: z.string().trim().max(128).optional(),
  documentExpiryDate: z.string().trim().optional(),
  salt: z.string().trim().max(160).optional(),
  regulatorCertificateId: z.string().trim().max(120).optional(),
});

export const transferInitiatorRoles = ["MANUFACTURER", "IMPORTER", "DISTRIBUTOR"] as const;
export const transferReceiverRoles = ["DISTRIBUTOR", "CLINIC", "PHARMACY"] as const;
export const allowedTransferRoutes: Record<(typeof transferInitiatorRoles)[number], Array<(typeof transferReceiverRoles)[number]>> = {
  MANUFACTURER: ["DISTRIBUTOR"],
  IMPORTER: ["DISTRIBUTOR"],
  DISTRIBUTOR: ["CLINIC", "PHARMACY"],
};

const initiatorRoleSchema = z.enum(transferInitiatorRoles);
const receiverRoleSchema = z.enum(transferReceiverRoles);
const optionalTransferText = (max: number, message: string) => z.string().trim().max(max, message).optional();
const optionalTimestamp = z.number().int().min(0).optional();
const optionalTemperature = z.number().min(-100, "Temperature is too low.").max(100, "Temperature is too high.").optional();

export const transferScanFormSchema = z
  .object({
    serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
    fromRole: initiatorRoleSchema,
    toRole: receiverRoleSchema,
    fromLocation: z.string().trim().max(200).optional(),
    fromLocationName: optionalTransferText(200, "From location is too long."),
    toLocationName: optionalTransferText(200, "To location is too long."),
    fromWarehouseName: optionalTransferText(200, "From warehouse is too long."),
    toWarehouseName: optionalTransferText(200, "To warehouse is too long."),
    carrierName: optionalTransferText(160, "Carrier name is too long."),
    vehicleId: optionalTransferText(80, "Vehicle ID is too long."),
    departedAt: optionalTimestamp,
    arrivedAt: optionalTimestamp,
    temperatureMinC: optionalTemperature,
    temperatureMaxC: optionalTemperature,
    temperatureUnit: z.enum(["C", "F"]).optional(),
    handlingNotes: optionalTransferText(1000, "Handling notes are too long."),
  })
  .refine((value) => allowedTransferRoutes[value.fromRole].includes(value.toRole), {
    path: ["toRole"],
    message: "Vai trò gửi không được phép chuyển đến vai trò nhận này.",
  })
  .refine((value) => {
    if (value.departedAt === undefined || value.arrivedAt === undefined) return true;
    return value.arrivedAt >= value.departedAt;
  }, {
    path: ["arrivedAt"],
    message: "Arrival time must be after departure time.",
  })
  .refine((value) => {
    if (value.temperatureMinC === undefined || value.temperatureMaxC === undefined) return true;
    return value.temperatureMaxC >= value.temperatureMinC;
  }, {
    path: ["temperatureMaxC"],
    message: "Maximum temperature must be greater than or equal to minimum temperature.",
  });

export const transferConfirmFormSchema = z.object({
  serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
});

export const transferRejectFormSchema = z.object({
  serialId: z.string().trim().min(3, "Serial ID phải có ít nhất 3 ký tự.").max(128).regex(idPattern, idMessage),
  rejectionReason: z.string().trim().min(1, "Vui lòng nhập lý do từ chối.").max(1000, "Lý do từ chối quá dài."),
});

export function getZodFieldErrors(error: z.ZodError) {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = String(issue.path[0] || "form");
    if (!acc[key]) acc[key] = issue.message;
    return acc;
  }, {});
}

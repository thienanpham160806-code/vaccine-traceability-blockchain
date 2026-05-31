import type { AppLanguage } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

export const productStatusLabel: Record<string, string> = {
  REGISTERED: "Đã đăng ký",
  VERIFIED: "Đã xác thực",
  IN_TRANSIT: "Đang vận chuyển",
  PENDING_DELIVERY: "Đang vận chuyển",
  DELIVERED: "Đã giao",
  FLAGGED: "Bị cảnh báo",
  RECALLED: "Đã thu hồi",
  INVALID: "Không hợp lệ",
  UNKNOWN: "Không rõ",
};

export const transferStatusLabel: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  RETURNED: "Đã hoàn trả",
  UNKNOWN: "Không rõ",
};

export const statusChipClass: Record<string, string> = {
  REGISTERED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IN_TRANSIT: "bg-blue-50 text-blue-700 border-blue-200",
  PENDING_DELIVERY: "bg-blue-50 text-blue-700 border-blue-200",
  DELIVERED: "bg-sky-50 text-sky-700 border-sky-200",
  FLAGGED: "bg-red-50 text-red-700 border-red-200",
  RECALLED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  INVALID: "bg-red-50 text-red-700 border-red-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  RETURNED: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function getProductStatusLabel(status?: string, language: AppLanguage = "vi") {
  const label = productStatusLabel[status || "UNKNOWN"] || status || productStatusLabel.UNKNOWN;
  return translate(label, language);
}

export function getTransferStatusLabel(status?: string, language: AppLanguage = "vi") {
  const label = transferStatusLabel[status || "UNKNOWN"] || status || transferStatusLabel.UNKNOWN;
  return translate(label, language);
}

export function getStatusChipClass(status?: string) {
  return statusChipClass[status || "UNKNOWN"] || "bg-zinc-100 text-zinc-600 border-zinc-200";
}

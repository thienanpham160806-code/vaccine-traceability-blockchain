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
  REGISTERED: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  IN_TRANSIT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  PENDING_DELIVERY: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  DELIVERED: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800",
  FLAGGED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  RECALLED: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
  INVALID: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  RETURNED: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
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
  return statusChipClass[status || "UNKNOWN"] || "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700";
}

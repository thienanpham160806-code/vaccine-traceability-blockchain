import type { AppLanguage } from "@/lib/i18n";

const productStatusVi: Record<string, string> = {
  REGISTERED: "Đã đăng ký",
  VERIFIED: "Đã xác minh",
  IN_TRANSIT: "Đang vận chuyển",
  PENDING_DELIVERY: "Chờ giao",
  DELIVERED: "Đã giao",
  FLAGGED: "Bị cảnh báo",
  RECALLED: "Đã thu hồi",
  INVALID: "Không hợp lệ",
  UNKNOWN: "Không rõ",
};

const productStatusEn: Record<string, string> = {
  REGISTERED: "Registered",
  VERIFIED: "Verified",
  IN_TRANSIT: "In transit",
  PENDING_DELIVERY: "Pending delivery",
  DELIVERED: "Delivered",
  FLAGGED: "Flagged",
  RECALLED: "Recalled",
  INVALID: "Invalid",
  UNKNOWN: "Unknown",
};

const transferStatusVi: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  RETURNED: "Đã hoàn trả",
  UNKNOWN: "Không rõ",
};

const transferStatusEn: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  UNKNOWN: "Unknown",
};

export const statusChipClass: Record<string, string> = {
  REGISTERED: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/60 dark:text-slate-200 dark:border-slate-800",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  IN_TRANSIT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  PENDING_DELIVERY: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  DELIVERED: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800",
  FLAGGED: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800",
  RECALLED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  INVALID: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  REJECTED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  RETURNED: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
};

export function getProductStatusLabel(status?: string, language: AppLanguage = "vi") {
  const labels = language === "en" ? productStatusEn : productStatusVi;
  return labels[status || "UNKNOWN"] || status || labels.UNKNOWN;
}

export function getTransferStatusLabel(status?: string, language: AppLanguage = "vi") {
  const labels = language === "en" ? transferStatusEn : transferStatusVi;
  return labels[status || "UNKNOWN"] || status || labels.UNKNOWN;
}

export function getStatusChipClass(status?: string) {
  return statusChipClass[status || "UNKNOWN"] || "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700";
}

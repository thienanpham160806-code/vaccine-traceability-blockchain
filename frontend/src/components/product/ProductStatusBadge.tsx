import type { ProductStatus, RiskLevel } from "@/lib/types";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const colors: Record<string, string> = {
    VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PENDING_DELIVERY: "border-blue-200 bg-blue-50 text-blue-700",
    IN_TRANSIT: "border-blue-200 bg-blue-50 text-blue-700",
    FLAGGED: "border-red-200 bg-red-50 text-red-700",
    RECALLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
  };
  const colorClass = colors[status] || "border-blue-200 bg-blue-50 text-blue-700";
  const labels: Record<ProductStatus, string> = {
    VERIFIED: "Đã xác minh",
    IN_TRANSIT: "Đang vận chuyển",
    PENDING_DELIVERY: "Chờ giao",
    DELIVERED: "Đã giao",
    FLAGGED: "Có cảnh báo",
    RECALLED: "Đã thu hồi",
    INVALID: "Không hợp lệ",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {labels[status] || status}
    </span>
  );
}

export function RiskLevelBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const colors: Record<string, string> = {
    SAFE: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ALERT: "border-amber-200 bg-amber-50 text-amber-700",
    HIGH: "border-red-200 bg-red-50 text-red-700",
    CRITICAL: "border-red-200 bg-red-50 text-red-800",
  };
  const colorClass = colors[riskLevel] || "border-zinc-200 bg-zinc-100 text-zinc-700";
  const labels: Record<RiskLevel, string> = {
    SAFE: "An toàn",
    ALERT: "Cảnh báo",
    HIGH: "Rủi ro cao",
    CRITICAL: "Nghiêm trọng",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {labels[riskLevel] || riskLevel}
    </span>
  );
}

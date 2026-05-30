import type { ProductStatus, RiskLevel } from "@/lib/types";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const colors: Record<string, string> = {
    VERIFIED: "bg-green-100 text-green-800",
    DELIVERED: "bg-green-100 text-green-800",
    PENDING_DELIVERY: "bg-yellow-100 text-yellow-800",
    FLAGGED: "bg-red-100 text-red-800",
    RECALLED: "bg-gray-100 text-gray-800",
  };
  const colorClass = colors[status] || "bg-blue-100 text-blue-800";
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {labels[status] || status}
    </span>
  );
}

export function RiskLevelBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const colors: Record<string, string> = {
    SAFE: "bg-green-100 text-green-800",
    ALERT: "bg-orange-100 text-orange-800",
    HIGH: "bg-red-100 text-red-800",
    CRITICAL: "bg-red-100 text-red-900",
  };
  const colorClass = colors[riskLevel] || "bg-gray-100 text-gray-800";
  const labels: Record<RiskLevel, string> = {
    SAFE: "An toàn",
    ALERT: "Cảnh báo",
    HIGH: "Rủi ro cao",
    CRITICAL: "Nghiêm trọng",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {labels[riskLevel] || riskLevel}
    </span>
  );
}

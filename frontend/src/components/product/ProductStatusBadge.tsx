import type { ProductStatus, RiskLevel } from "@/lib/types";
import { getProductStatusLabel, getStatusChipClass } from "@/lib/status";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const colorClass = getStatusChipClass(status).replace("border", "");

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {getProductStatusLabel(status)}
    </span>
  );
}

export function RiskLevelBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const colors: Record<string, string> = {
    SAFE: "bg-green-100 text-green-800",
    ALERT: "bg-orange-100 text-orange-800",
    HIGH: "bg-red-100 text-red-800",
  };
  const colorClass = colors[riskLevel] || "bg-gray-100 text-gray-800";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {riskLevel === "SAFE" ? "An toàn" : riskLevel === "ALERT" ? "Cảnh báo" : "Nguy cơ cao"}
    </span>
  );
}

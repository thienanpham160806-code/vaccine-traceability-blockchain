import type { ProductStatus, RiskLevel } from "@/lib/types";
import { getProductStatusLabel, getStatusChipClass } from "@/lib/status";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const { language } = useLanguage();
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusChipClass(status)}`}>
      {getProductStatusLabel(status, language)}
    </span>
  );
}

export function RiskLevelBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const t = useTranslation();
  const colors: Record<string, string> = {
    SAFE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    ALERT: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
    HIGH: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200",
    CRITICAL: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200",
  };
  const colorClass = colors[riskLevel] || "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  const labels: Record<RiskLevel, string> = {
    SAFE: "An toàn",
    ALERT: "Cảnh báo",
    HIGH: "Rủi ro cao",
    CRITICAL: "Nghiêm trọng",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {t(labels[riskLevel] || riskLevel)}
    </span>
  );
}

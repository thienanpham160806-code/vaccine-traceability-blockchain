"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, Snowflake, Thermometer } from "lucide-react";
import { getColdChainLegs } from "@/lib/api";
import type { ColdChainLeg, ColdChainLegStatus } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";

function getLegStatusChip(status: ColdChainLegStatus, t: (key: string) => string) {
  switch (status) {
    case "SEALED":
      return { label: t("Đã niêm phong"), cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" };
    case "SEALING":
      return { label: t("Đang niêm phong"), cls: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300" };
    case "CLOSED_PENDING_SEAL":
      return { label: t("Chờ niêm phong"), cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" };
    default:
      return { label: t("Đang mở"), cls: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" };
  }
}

function LegRow({ leg, t }: { leg: ColdChainLeg; t: (key: string) => string }) {
  const chip = getLegStatusChip(leg.status, t);
  const hasExcursion = leg.excursionCount > 0;

  return (
    <Link
      href={`/dashboard/coldchain/${encodeURIComponent(leg.legId)}`}
      className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-blue-500/50"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="truncate font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-100">{leg.legId}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
          {hasExcursion ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {leg.excursionCount} {t("vượt ngưỡng")}
            </span>
          ) : null}
        </div>
        <p className="truncate font-mono text-xs text-zinc-400 dark:text-zinc-500">{leg.lotIdHash}</p>
        <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{leg.thresholdMinC}°C – {leg.thresholdMaxC}°C</span>
          <span>{t("Số lần đọc")}: {leg.readingCount}</span>
          {leg.updatedAt ? <span>{new Date(leg.updatedAt).toLocaleString("vi-VN")}</span> : null}
        </div>
      </div>
      <ArrowRight className="ml-4 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-blue-500 dark:text-zinc-600 dark:group-hover:text-blue-300" />
    </Link>
  );
}

export default function ColdChainDashboardPage() {
  const queryClient = useQueryClient();
  const t = useTranslation();
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: legs = [], isLoading } = useQuery<ColdChainLeg[]>({
    queryKey: ["cold-chain-legs"],
    queryFn: () => getColdChainLegs(),
  });

  const filteredLegs = legs.filter((leg) => {
    if (statusFilter === "EXCURSION") return leg.excursionCount > 0;
    if (statusFilter === "ALL") return true;
    return leg.status === statusFilter;
  });

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{t("Bảo quản lạnh")}</h1>
        <p className="text-muted-foreground">
          {t("Theo dõi các chặng vận chuyển lô vắc-xin, dữ liệu nhiệt độ và trạng thái niêm phong on-chain.")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-blue-500" />
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">
            {t("Chặng bảo quản lạnh")}
            {legs.length > 0 ? <span className="ml-2 font-normal text-zinc-400">({legs.length})</span> : null}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">{t("Tất cả trạng thái")}</option>
            <option value="OPEN">{t("Đang mở")}</option>
            <option value="CLOSED_PENDING_SEAL">{t("Chờ niêm phong")}</option>
            <option value="SEALED">{t("Đã niêm phong")}</option>
            <option value="EXCURSION">{t("Vượt ngưỡng nhiệt")}</option>
          </select>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["cold-chain-legs"] })}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RefreshCw className="h-3 w-3" />
            {t("Làm mới")}
          </button>
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/30">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />)}</div>
        ) : filteredLegs.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-14 text-center dark:border-zinc-700">
            <Thermometer className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{t("Chưa có chặng bảo quản lạnh nào.")}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {t("Các chặng được mở tự động khi tạo chuyển giao theo lô.")}
            </p>
          </div>
        ) : (
          <div className="max-h-[min(58vh,580px)] space-y-2 overflow-y-auto pr-1">
            {filteredLegs.map((leg) => (
              <LegRow key={leg.legId} leg={leg} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

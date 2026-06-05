"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { getApiErrorMessage, getRiskFlags, resolveRiskFlag } from "@/lib/api";
import type { RiskFlag } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";

const riskChip: Record<string, string> = {
  SAFE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ALERT: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

const riskBorder: Record<string, string> = {
  SAFE: "border-l-emerald-400",
  ALERT: "border-l-amber-400",
  HIGH: "border-l-orange-400",
  CRITICAL: "border-l-red-500",
};

function getFlagId(flag: RiskFlag, index: number) {
  return flag.id || flag.serialId || `risk-${index}`;
}

export default function RiskFlagsPage() {
  const qc = useQueryClient();
  const t = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: riskFlags = [], isLoading } = useQuery<RiskFlag[]>({
    queryKey: ["risk-flags"],
    queryFn: getRiskFlags,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const openFlags = riskFlags.filter((flag) => flag.status !== "RESOLVED");
  const resolvedFlags = riskFlags.filter((flag) => flag.status === "RESOLVED");

  const handleResolve = async (flag: RiskFlag, index: number) => {
    const id = getFlagId(flag, index);
    setBusyId(id);
    setError(null);

    try {
      await resolveRiskFlag(id, {
        note: notes[id] || t("Đã kiểm tra trên dashboard."),
        resolvedBy: "dashboard-user",
      });
      setNotes((current) => ({ ...current, [id]: "" }));
      qc.invalidateQueries({ queryKey: ["risk-flags"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Không thể đánh dấu đã xử lý cảnh báo.")));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t("Quản lý rủi ro")}</p>
          <h1 className="text-3xl font-bold">{t("Cảnh báo rủi ro")}</h1>
        </div>
        <button
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          onClick={() => qc.invalidateQueries({ queryKey: ["risk-flags"] })}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          {t("Làm mới")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{t("Đang mở")}</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{openFlags.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{t("Đã xử lý")}</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{resolvedFlags.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{t("Nghiêm trọng")}</p>
          <p className="mt-1 text-3xl font-bold text-red-700">
            {riskFlags.filter((flag) => flag.riskLevel === "CRITICAL").length}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          <h2 className="font-bold">{t("Cảnh báo đang mở")}</h2>
        </div>

        <div className="max-h-[460px] space-y-3 overflow-y-auto p-4 lg:max-h-[calc(100dvh-27rem)]">
          {isLoading ? (
            [1, 2, 3].map((item) => <div className="h-24 animate-pulse rounded-lg bg-zinc-100" key={item} />)
          ) : openFlags.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              {t("Không có cảnh báo rủi ro đang mở.")}
            </div>
          ) : (
            openFlags.map((flag, index) => {
              const id = getFlagId(flag, index);
              const level = flag.riskLevel || "ALERT";

              return (
                <article className={`rounded-lg border border-l-4 border-zinc-200 p-4 ${riskBorder[level]}`} key={id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="break-all font-mono text-sm font-semibold">{flag.serialId || id}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{flag.reason || flag.flagReason || t("Cảnh báo rủi ro")}</p>
                      {flag.createdAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(flag.createdAt).toLocaleString()}</p>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskChip[level]}`}>
                      {t(level)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <input
                      className="rounded-md border bg-zinc-50 px-3 py-2 text-sm"
                      onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))}
                      placeholder={t("Ghi chú xử lý")}
                      value={notes[id] || ""}
                    />
                    {flag.serialId ? (
                      <Link
                        className="rounded-md border px-3 py-2 text-center text-sm font-semibold"
                        href={`/dashboard/products/${encodeURIComponent(flag.serialId)}`}
                      >
                        {t("Sản phẩm")}
                      </Link>
                    ) : null}
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                      disabled={busyId === id}
                      onClick={() => handleResolve(flag, index)}
                      type="button"
                    >
                      {busyId === id ? t("Đang xử lý...") : t("Đánh dấu đã xử lý")}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <AlertTriangle className="h-4 w-4 text-emerald-500" />
          <h2 className="font-bold">{t("Lịch sử đã xử lý")}</h2>
        </div>
        <div className="max-h-[360px] divide-y overflow-y-auto lg:max-h-[calc(100dvh-31rem)]">
          {resolvedFlags.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("Chưa có cảnh báo nào được xử lý.")}</p>
          ) : (
            resolvedFlags.map((flag, index) => {
              const id = getFlagId(flag, index);
              return (
                <div className="p-4 text-sm" key={id}>
                  <p className="break-all font-mono font-semibold">{flag.serialId || id}</p>
                  <p className="text-muted-foreground">{flag.resolutionNote || t("Đã xử lý")}</p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

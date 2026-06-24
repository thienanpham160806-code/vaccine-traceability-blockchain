"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { createDispute, getApiErrorMessage, getDisputes, getRiskFlags } from "@/lib/api";
import type { DisputeRecord } from "@/lib/api";
import type { RiskFlag } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const riskChip: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

const riskBorder: Record<string, string> = {
  LOW: "border-l-emerald-400",
  MEDIUM: "border-l-amber-400",
  HIGH: "border-l-orange-400",
  CRITICAL: "border-l-red-500",
};

const disputeChip: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const disputeStatusLabel: Record<string, string> = {
  OPEN: "Đang mở",
  RESOLVED: "Đã xử lý",
  REJECTED: "Đã từ chối",
};

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

export default function RiskDisputePage() {
  const qc = useQueryClient();
  const t = useTranslation();
  const { language } = useLanguage();

  const { data: riskFlags = [], isLoading: flagsLoading } = useQuery<RiskFlag[]>({
    queryKey: ["risk-flags"],
    queryFn: getRiskFlags,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: disputes = [], isLoading: disputesLoading } = useQuery<DisputeRecord[]>({
    queryKey: ["disputes"],
    queryFn: getDisputes,
  });

  const [serialId, setSerialId] = useState("");
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "vi-VN");

  const submitDispute = async () => {
    if (!serialId.trim() || !reason.trim()) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await createDispute({
        relatedSerialId: serialId.trim(),
        reason: reason.trim(),
        reportedBy: "dashboard-user",
      });
      setSuccess(`${t("Khiếu nại đã tạo")}: ${data.id}`);
      setSerialId("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Tạo khiếu nại thất bại.")));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <h2 className="font-bold text-zinc-900">{t("Cảnh báo rủi ro")}</h2>
            </div>
            <div className="flex items-center gap-2">
              {riskFlags.length > 0 && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                  {riskFlags.length}
                </span>
              )}
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ["risk-flags"] })}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:bg-zinc-50"
                aria-label={t("Làm mới")}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto p-3 lg:max-h-[calc(100dvh-24rem)]">
            {flagsLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100" />)}
              </div>
            ) : riskFlags.length === 0 ? (
              <div className="py-10 text-center">
                <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-zinc-200" />
                <p className="text-sm text-zinc-400">{t("Không có cảnh báo. Hệ thống bình thường.")}</p>
              </div>
            ) : (
              riskFlags.map((flag) => (
                <div
                  key={flag.id || flag.serialId}
                  className={`rounded-lg border border-l-4 border-zinc-200 p-3 ${
                    riskBorder[flag.riskLevel ?? "MEDIUM"] ?? "border-l-zinc-400"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-all font-mono text-xs text-zinc-700">{flag.serialId}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        riskChip[flag.riskLevel ?? "MEDIUM"] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
                      }`}
                    >
                      {flag.riskLevel ? t(flag.riskLevel) : `${t("Mức")} ${flag.level}`}
                    </span>
                  </div>
                  {flag.reason && <p className="mt-1 text-xs text-zinc-500">{flag.reason}</p>}
                  {flag.createdAt && (
                    <p className="mt-0.5 text-[10px] text-zinc-400">{formatTime(flag.createdAt)}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-bold text-zinc-900">{t("Gửi khiếu nại")}</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {t("Báo cáo sự cố với một sản phẩm cụ thể bằng serial ID.")}
            </p>
          </div>

          <div className="space-y-4">
            <Field label="Serial ID">
              <input
                className={`${inputCls} font-mono`}
                value={serialId}
                onChange={(e) => setSerialId(e.target.value)}
                placeholder="VCN-..."
              />
            </Field>
            <Field label={t("Lý do / Bằng chứng")}>
              <textarea
                className={`${inputCls} min-h-[100px]`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("Mô tả vấn đề chi tiết...")}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {success}
            </div>
          )}

          <button
            onClick={submitDispute}
            disabled={isBusy || !serialId.trim() || !reason.trim()}
            className="btn-brand mt-5 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isBusy ? t("Đang gửi...") : t("Gửi khiếu nại")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="font-bold text-zinc-900">
            {t("Danh sách khiếu nại")}
            {disputes.length > 0 && (
              <span className="ml-2 font-normal text-zinc-400">({disputes.length})</span>
            )}
          </h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["disputes"] })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            aria-label={t("Làm mới")}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        <div className="max-h-[430px] overflow-y-auto p-4 lg:max-h-[calc(100dvh-26rem)]">
          {disputesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-zinc-100" />)}
            </div>
          ) : disputes.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-zinc-400">{t("Chưa có khiếu nại nào.")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {disputes.map((dispute) => {
                const status = dispute.status || "OPEN";

                return (
                  <div
                    key={dispute.id}
                    className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-zinc-700">{dispute.id}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          disputeChip[status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
                        }`}
                      >
                        {t(disputeStatusLabel[status] || status)}
                      </span>
                    </div>
                    <p className="break-all font-mono text-xs text-zinc-500">{dispute.relatedSerialId}</p>
                    <p className="text-xs text-zinc-600">{dispute.reason}</p>
                    {dispute.createdAt && (
                      <p className="text-[10px] text-zinc-400">{formatTime(dispute.createdAt)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

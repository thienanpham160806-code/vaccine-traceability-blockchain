"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FilePlus2, RefreshCw, RotateCcw, Send, ShieldAlert } from "lucide-react";
import {
  addDisputeEvidence,
  createDispute,
  getApiErrorMessage,
  getDisputes,
  getProductDetail,
  getRiskFlags,
  updateDisputeStatus,
  type DisputeRecord,
} from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { isAdminAuthority } from "@/lib/role-access";
import type { RiskFlag } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

type DisputeTargetType = "SERIAL" | "BATCH";
type AdminStatus = "INVESTIGATING" | "NEEDS_EXPLANATION" | "RESOLVED" | "REJECTED" | "RECALL_CREATED";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

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
  INVESTIGATING: "bg-amber-50 text-amber-700 border-amber-200",
  NEEDS_EXPLANATION: "bg-purple-50 text-purple-700 border-purple-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-zinc-100 text-zinc-600 border-zinc-200",
  RECALL_CREATED: "bg-red-50 text-red-700 border-red-200",
};

const disputeStatusLabel: Record<string, string> = {
  OPEN: "Đang mở",
  INVESTIGATING: "Đang điều tra",
  NEEDS_EXPLANATION: "Cần giải trình",
  RESOLVED: "Đã xử lý",
  REJECTED: "Đã từ chối",
  RECALL_CREATED: "Đã tạo thu hồi",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function targetLabel(dispute: DisputeRecord) {
  const type = dispute.targetType || (dispute.relatedBatchId ? "BATCH" : "SERIAL");
  const id = dispute.targetId || dispute.relatedBatchId || dispute.relatedSerialId || "";
  return { type, id };
}

export default function RiskDisputePage() {
  const qc = useQueryClient();
  const router = useRouter();
  const t = useTranslation();
  const { language } = useLanguage();
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const adminAuthority = isAdminAuthority(user);

  const [targetType, setTargetType] = useState<DisputeTargetType>("SERIAL");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [evidenceValues, setEvidenceValues] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recallBusyId, setRecallBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "vi-VN");

  const submitDispute = async () => {
    if (!targetId.trim() || !reason.trim()) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await createDispute({
        targetType,
        targetId: targetId.trim(),
        relatedSerialId: targetType === "SERIAL" ? targetId.trim() : undefined,
        reason: reason.trim(),
        reportedBy: "dashboard-user",
      });
      setSuccess(`${t("Khiếu nại đã tạo")}: ${data.id}`);
      setTargetId("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Tạo khiếu nại thất bại.")));
    } finally {
      setIsBusy(false);
    }
  };

  const updateStatus = async (dispute: DisputeRecord, status: AdminStatus) => {
    if (!dispute.id || !adminAuthority) return;
    setBusyId(dispute.id);
    setError(null);

    try {
      await updateDisputeStatus(dispute.id, {
        status,
        note: statusNotes[dispute.id] || "",
        updatedBy: "dashboard-user",
      });
      setStatusNotes((current) => ({ ...current, [dispute.id || ""]: "" }));
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Không thể cập nhật trạng thái khiếu nại.")));
    } finally {
      setBusyId(null);
    }
  };

  const addEvidence = async (dispute: DisputeRecord) => {
    if (!dispute.id || !evidenceValues[dispute.id]?.trim()) return;
    setBusyId(dispute.id);
    setError(null);

    try {
      await addDisputeEvidence(dispute.id, {
        type: "NOTE",
        title: t("Ghi chú từ dashboard"),
        value: evidenceValues[dispute.id].trim(),
        addedBy: "dashboard-user",
      });
      setEvidenceValues((current) => ({ ...current, [dispute.id || ""]: "" }));
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Không thể thêm bằng chứng.")));
    } finally {
      setBusyId(null);
    }
  };

  const goToRecall = async (dispute: DisputeRecord) => {
    if (!adminAuthority) return;
    const target = targetLabel(dispute);
    if (!target.id) return;

    const id = dispute.id || target.id;
    setRecallBusyId(id);
    setError(null);
    try {
      let batchId = target.type === "BATCH" ? target.id : "";
      if (!batchId) {
        const detail = await getProductDetail(target.id);
        batchId = detail.product.batchHash || detail.product.batchId || detail.batch?.batchHash || detail.batch?.id || "";
      }
      if (!batchId) throw new Error("Không tìm thấy lô liên quan tới khiếu nại.");
      const params = new URLSearchParams({
        batchId,
        reason: dispute.reason || "Khiếu nại cần xử lý thu hồi",
        fromDispute: dispute.id || "",
      });
      router.push(`/dashboard/recall?${params.toString()}`);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Không thể mở form thu hồi cho khiếu nại này.")));
    } finally {
      setRecallBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <h2 className="font-bold text-zinc-900">{t("Cảnh báo rủi ro")}</h2>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["risk-flags"] })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              aria-label={t("Làm mới")}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto p-3 lg:max-h-[calc(100dvh-24rem)]">
            {flagsLoading ? (
              [1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100" />)
            ) : riskFlags.length === 0 ? (
              <div className="py-10 text-center">
                <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-zinc-200" />
                <p className="text-sm text-zinc-400">{t("Không có cảnh báo. Hệ thống bình thường.")}</p>
              </div>
            ) : (
              riskFlags.map((flag) => (
                <article
                  key={flag.id || flag.serialId}
                  className={`rounded-lg border border-l-4 border-zinc-200 p-3 ${
                    riskBorder[flag.riskLevel ?? "MEDIUM"] ?? "border-l-zinc-400"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-all font-mono text-xs text-zinc-700">{flag.serialId}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskChip[flag.riskLevel ?? "MEDIUM"] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                      {flag.riskLevel ? t(flag.riskLevel) : `${t("Mức")} ${flag.level}`}
                    </span>
                  </div>
                  {flag.reason ? <p className="mt-1 text-xs text-zinc-500">{flag.reason}</p> : null}
                  {flag.createdAt ? <p className="mt-0.5 text-[10px] text-zinc-400">{formatTime(flag.createdAt)}</p> : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-bold text-zinc-900">{t("Gửi khiếu nại")}</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {t("Báo cáo serial hoặc lô có dấu hiệu rủi ro, sai cảnh báo, hoặc tranh chấp quyền sở hữu.")}
            </p>
          </div>

          <div className="space-y-4">
            <Field label={t("Đối tượng")}>
              <div className="grid grid-cols-2 gap-2">
                {(["SERIAL", "BATCH"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTargetType(type);
                      setTargetId("");
                    }}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${
                      targetType === type
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {type === "SERIAL" ? "Serial" : "Batch"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={targetType === "SERIAL" ? "Serial ID" : "Batch ID"}>
              <input
                className={`${inputCls} font-mono`}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                placeholder={targetType === "SERIAL" ? "VCN-..." : "BATCH-..."}
              />
            </Field>
            <Field label={t("Lý do / Bằng chứng")}>
              <textarea
                className={`${inputCls} min-h-[100px]`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("Mô tả vấn đề chi tiết...")}
              />
            </Field>
          </div>

          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div> : null}
          {success ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{success}</div> : null}

          <button
            onClick={submitDispute}
            disabled={isBusy || !targetId.trim() || !reason.trim()}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            type="button"
          >
            <Send className="h-4 w-4" />
            {isBusy ? t("Đang gửi...") : t("Gửi khiếu nại")}
          </button>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="font-bold text-zinc-900">
            {t("Danh sách khiếu nại")}
            {disputes.length > 0 ? <span className="ml-2 font-normal text-zinc-400">({disputes.length})</span> : null}
          </h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["disputes"] })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            aria-label={t("Làm mới")}
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {disputesLoading ? (
            [1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-100" />)
          ) : disputes.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400">{t("Chưa có khiếu nại nào.")}</p>
          ) : (
            disputes.map((dispute) => {
              const status = dispute.status || "OPEN";
              const target = targetLabel(dispute);
              return (
                <article key={dispute.id || target.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{dispute.id || t("Khiếu nại")}</p>
                      <p className="mt-1 break-all font-mono text-xs text-blue-700">
                        {target.type}: {target.id}
                      </p>
                      <p className="mt-2 text-sm text-zinc-700">{dispute.reason}</p>
                      {dispute.createdAt ? <p className="mt-1 text-[10px] text-zinc-400">{formatTime(dispute.createdAt)}</p> : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${disputeChip[status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                      {t(disputeStatusLabel[status] || status)}
                    </span>
                  </div>

                  {adminAuthority ? (
                    <div className="mt-4 space-y-3">
                      <input
                        className={inputCls}
                        onChange={(event) => setStatusNotes((current) => ({ ...current, [dispute.id || ""]: event.target.value }))}
                        placeholder={t("Ghi chú trạng thái")}
                        value={statusNotes[dispute.id || ""] || ""}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={!dispute.id || busyId === dispute.id} onClick={() => updateStatus(dispute, "INVESTIGATING")} type="button">
                          {t("Điều tra")}
                        </button>
                        <button className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={!dispute.id || busyId === dispute.id} onClick={() => updateStatus(dispute, "NEEDS_EXPLANATION")} type="button">
                          {t("Yêu cầu giải trình")}
                        </button>
                        <button className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400" disabled={!dispute.id || busyId === dispute.id} onClick={() => updateStatus(dispute, "RESOLVED")} type="button">
                          {t("Xử lý xong")}
                        </button>
                        <button className="rounded-md bg-zinc-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400" disabled={!dispute.id || busyId === dispute.id} onClick={() => updateStatus(dispute, "REJECTED")} type="button">
                          {t("Từ chối")}
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          disabled={recallBusyId === (dispute.id || target.id)}
                          onClick={() => goToRecall(dispute)}
                          type="button"
                        >
                          <RotateCcw className="h-4 w-4" />
                          {recallBusyId === (dispute.id || target.id) ? t("Đang mở form...") : t("Xử lý thu hồi")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                    <input
                      className={inputCls}
                      onChange={(event) => setEvidenceValues((current) => ({ ...current, [dispute.id || ""]: event.target.value }))}
                      placeholder={t("Thêm ghi chú bằng chứng hoặc IPFS CID")}
                      value={evidenceValues[dispute.id || ""] || ""}
                    />
                    <button
                      className="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={!dispute.id || busyId === dispute.id || !evidenceValues[dispute.id || ""]?.trim()}
                      onClick={() => addEvidence(dispute)}
                      type="button"
                    >
                      <FilePlus2 className="h-4 w-4" />
                      {t("Thêm bằng chứng")}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

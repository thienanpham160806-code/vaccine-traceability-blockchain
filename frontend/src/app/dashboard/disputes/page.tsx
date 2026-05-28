"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, RefreshCw, Scale, Send } from "lucide-react";
import {
  addDisputeEvidence,
  createDispute,
  getApiErrorMessage,
  getDisputes,
  updateDisputeStatus,
  type DisputeRecord,
} from "@/lib/api";

const statusChip: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  INVESTIGATING: "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const statusLabel: Record<string, string> = {
  OPEN: "Đang mở",
  INVESTIGATING: "Đang điều tra",
  RESOLVED: "Đã xử lý",
  REJECTED: "Đã từ chối",
};

const inputCls = "w-full rounded-md border bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-400";

export default function DisputesPage() {
  const qc = useQueryClient();
  const [serialId, setSerialId] = useState("");
  const [reason, setReason] = useState("");
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [evidenceValues, setEvidenceValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: disputes = [], isLoading } = useQuery<DisputeRecord[]>({
    queryKey: ["disputes"],
    queryFn: getDisputes,
  });

  const create = async () => {
    if (!serialId.trim() || !reason.trim()) return;
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const dispute = await createDispute({
        relatedSerialId: serialId.trim(),
        reason: reason.trim(),
        reportedBy: "dashboard-user",
      });
      setSuccess(`Đã tạo khiếu nại: ${dispute.id}`);
      setSerialId("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Không thể tạo khiếu nại."));
    } finally {
      setIsCreating(false);
    }
  };

  const updateStatus = async (dispute: DisputeRecord, status: "INVESTIGATING" | "RESOLVED" | "REJECTED") => {
    if (!dispute.id) return;
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
      setError(getApiErrorMessage(err, "Không thể cập nhật trạng thái khiếu nại."));
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
        title: "Ghi chú từ dashboard",
        value: evidenceValues[dispute.id].trim(),
        addedBy: "dashboard-user",
      });
      setEvidenceValues((current) => ({ ...current, [dispute.id || ""]: "" }));
      qc.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Không thể thêm bằng chứng."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Quản lý tranh chấp</p>
          <h1 className="text-3xl font-bold">Khiếu nại</h1>
        </div>
        <button
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          onClick={() => qc.invalidateQueries({ queryKey: ["disputes"] })}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b pb-4">
          <Scale className="h-4 w-4 text-blue-500" />
          <h2 className="font-bold">Tạo khiếu nại</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <input
            className={`${inputCls} font-mono`}
            onChange={(event) => setSerialId(event.target.value)}
            placeholder="Serial ID"
            value={serialId}
          />
          <input
            className={inputCls}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lý do hoặc bằng chứng ban đầu"
            value={reason}
          />
          <button
            className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
            disabled={isCreating || !serialId.trim() || !reason.trim()}
            onClick={create}
            type="button"
          >
            <Send className="h-4 w-4" />
            Gửi
          </button>
        </div>
        {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {success ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</p> : null}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <h2 className="font-bold">Danh sách khiếu nại</h2>
        </div>

        <div className="space-y-3 p-4">
          {isLoading ? (
            [1, 2, 3].map((item) => <div className="h-28 animate-pulse rounded-lg bg-zinc-100" key={item} />)
          ) : disputes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Chưa có khiếu nại nào.</p>
          ) : (
            disputes.map((dispute) => (
              <article className="rounded-lg border bg-zinc-50 p-4" key={dispute.id || dispute.relatedSerialId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{dispute.id || "Khiếu nại"}</p>
                    <Link
                      className="break-all font-mono text-xs text-blue-600 hover:underline"
                      href={`/dashboard/products/${encodeURIComponent(dispute.relatedSerialId)}`}
                    >
                      {dispute.relatedSerialId}
                    </Link>
                    <p className="mt-2 text-sm text-zinc-700">{dispute.reason}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusChip[dispute.status || "OPEN"]}`}>
                    {statusLabel[dispute.status || "OPEN"] || dispute.status || "Đang mở"}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
                  <input
                    className={inputCls}
                    onChange={(event) =>
                      setStatusNotes((current) => ({ ...current, [dispute.id || ""]: event.target.value }))
                    }
                    placeholder="Ghi chú trạng thái"
                    value={statusNotes[dispute.id || ""] || ""}
                  />
                  <button
                    className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={!dispute.id || busyId === dispute.id}
                    onClick={() => updateStatus(dispute, "INVESTIGATING")}
                    type="button"
                  >
                    Điều tra
                  </button>
                  <button
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                    disabled={!dispute.id || busyId === dispute.id}
                    onClick={() => updateStatus(dispute, "RESOLVED")}
                    type="button"
                  >
                    Xử lý xong
                  </button>
                  <button
                    className="rounded-md bg-zinc-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                    disabled={!dispute.id || busyId === dispute.id}
                    onClick={() => updateStatus(dispute, "REJECTED")}
                    type="button"
                  >
                    Từ chối
                  </button>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className={inputCls}
                    onChange={(event) =>
                      setEvidenceValues((current) => ({ ...current, [dispute.id || ""]: event.target.value }))
                    }
                    placeholder="Thêm ghi chú bằng chứng hoặc IPFS CID"
                    value={evidenceValues[dispute.id || ""] || ""}
                  />
                  <button
                    className="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={!dispute.id || busyId === dispute.id || !evidenceValues[dispute.id || ""]?.trim()}
                    onClick={() => addEvidence(dispute)}
                    type="button"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Thêm bằng chứng
                  </button>
                </div>

                {dispute.evidence && dispute.evidence.length > 0 ? (
                  <div className="mt-3 rounded-md border bg-white p-3 text-xs">
                    <p className="font-bold">Bằng chứng</p>
                    <ul className="mt-2 space-y-1">
                      {dispute.evidence.map((item) => (
                        <li className="break-all text-muted-foreground" key={item.id}>
                          {item.title}: {item.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

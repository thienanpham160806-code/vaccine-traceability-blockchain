"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { confirmTransfer, getApiErrorMessage, getTransfer, rejectTransfer } from "@/lib/api";
import type { TransferRecord } from "@/lib/types";

interface PageProps {
  params: Promise<{ transferId: string }>;
}

const statusChip: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  RETURNED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const statusLabel: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  RETURNED: "Đã hoàn",
};

function MetaField({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className={`mt-1 break-all text-sm ${mono ? "font-mono text-zinc-500" : "font-semibold text-zinc-800"}`}>
        {value}
      </p>
    </div>
  );
}

export default function TransferDetailPage({ params }: PageProps) {
  const { transferId } = use(params);
  const decoded = decodeURIComponent(transferId);
  const qc = useQueryClient();

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data: transfer, isLoading } = useQuery<TransferRecord | undefined>({
    queryKey: ["transfer", decoded],
    queryFn: () => getTransfer(decoded),
  });

  const handleConfirm = async () => {
    if (!transfer || busy) return;
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await confirmTransfer(transfer.serialId);
      setActionSuccess(`Đã xác nhận. TX: ${result.txHash}`);
      qc.invalidateQueries({ queryKey: ["transfer", decoded] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setActionError(getApiErrorMessage(err, "Xác nhận thất bại."));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!transfer || !rejectReason.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await rejectTransfer(transfer.serialId, rejectReason.trim());
      setActionSuccess(`Đã từ chối on-chain. TX: ${result.txHash}`);
      setShowRejectForm(false);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["transfer", decoded] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setActionError(getApiErrorMessage(err, "Từ chối thất bại."));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
        ))}
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
          📋
        </div>
        <p className="font-bold text-zinc-800">Không tìm thấy lệnh chuyển</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decoded}</p>
        <Link
          href="/dashboard/scan-transfer"
          className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Back */}
      <Link
        href="/dashboard/scan-transfer"
        className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Chuyển & Nhận
      </Link>

      {/* Header with status */}
      <div className="flex items-center gap-4 flex-wrap">
        <span
          className={`rounded-full border px-4 py-1.5 text-sm font-bold ${
            statusChip[transfer.status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
          }`}
        >
          {statusLabel[transfer.status] ?? transfer.status}
        </span>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Serial ID</p>
          <p className="font-mono text-sm font-semibold text-zinc-800">{transfer.serialId}</p>
        </div>
      </div>

      {/* Transfer route visualization */}
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex-1 rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Từ</p>
          <p className="mt-1 font-bold text-zinc-800">{transfer.fromRole}</p>
          {transfer.fromAddress && (
            <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {transfer.fromAddress.slice(0, 6)}…{transfer.fromAddress.slice(-4)}
            </p>
          )}
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" />
        <div className="flex-1 rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Đến</p>
          <p className="mt-1 font-bold text-zinc-800">{transfer.toRole}</p>
          {transfer.toAddress && (
            <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {transfer.toAddress.slice(0, 6)}…{transfer.toAddress.slice(-4)}
            </p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <MetaField label="Mã lô (Batch ID)" value={transfer.batchId} mono />
        <MetaField label="Blockchain TX" value={transfer.blockchainTx} mono />
        <MetaField label="IPFS CID" value={transfer.ipfsCid} mono />
        <MetaField label="Lý do từ chối" value={transfer.rejectedReason} />
        <MetaField
          label="Tạo lúc"
          value={transfer.createdAt ? new Date(transfer.createdAt).toLocaleString("vi-VN") : undefined}
        />
        {transfer.confirmedAt && (
          <MetaField
            label="Xác nhận lúc"
            value={new Date(transfer.confirmedAt).toLocaleString("vi-VN")}
          />
        )}
        {transfer.rejectedAt && (
          <MetaField
            label="Từ chối lúc"
            value={new Date(transfer.rejectedAt).toLocaleString("vi-VN")}
          />
        )}
      </div>

      {/* Actions (PENDING only) */}
      {transfer.status === "PENDING" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="border-b border-zinc-100 pb-3 font-bold text-zinc-900">Thao tác</h2>

          {actionSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {actionSuccess}
            </div>
          )}
          {actionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {actionError}
            </div>
          )}

          {showRejectForm ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  Lý do từ chối
                </p>
                <textarea
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 min-h-[80px]"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Mô tả vấn đề…"
                />
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy || !rejectReason.trim()}
                  onClick={handleReject}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  {busy ? "Đang từ chối…" : "Xác nhận từ chối"}
                </button>
                <button
                  onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button
                disabled={busy}
                onClick={handleConfirm}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Đang xác nhận…" : "Xác nhận giao hàng"}
              </button>
              <button
                disabled={busy}
                onClick={() => setShowRejectForm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Từ chối lệnh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={`/dashboard/verify/${encodeURIComponent(transfer.serialId)}`}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Verify sản phẩm
        </Link>
        <Link
          href="/dashboard/scan-transfer"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Tất cả lệnh
        </Link>
      </div>
    </div>
  );
}

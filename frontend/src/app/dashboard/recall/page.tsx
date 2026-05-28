"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { createRecall, getApiErrorMessage, getRecalls } from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-red-300 focus:bg-white focus:ring-2 focus:ring-red-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function RecallCard({ recall }: { recall: any }) {
  return (
    <div className="rounded-xl border-l-4 border-l-red-500 border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Batch Hash</p>
          <p className="mt-0.5 break-all font-mono text-xs text-zinc-700">{recall.batchHash}</p>
        </div>
        <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
          THU HỒI
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-sm">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Lý do</p>
          <p className="mt-0.5 font-semibold text-zinc-800">{recall.reason || recall.reasonHash}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Serial ảnh hưởng</p>
          <p className="mt-0.5 font-semibold text-zinc-800">{recall.serialsAffected ?? "—"}</p>
        </div>
      </div>
      {(recall.txHash || recall.blockchainTx) && (
        <p className="break-all font-mono text-[10px] text-zinc-400">
          TX: {recall.txHash || recall.blockchainTx}
        </p>
      )}
      {recall.createdAt && (
        <p className="text-xs text-zinc-400">{new Date(recall.createdAt).toLocaleString("vi-VN")}</p>
      )}
    </div>
  );
}

export default function RecallPage() {
  const qc = useQueryClient();
  const { data: recalls = [], isLoading } = useQuery<any[]>({
    queryKey: ["recalls"],
    queryFn: getRecalls,
  });

  const [batchHash, setBatchHash] = useState("");
  const [serials, setSerials] = useState("");
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    if (!batchHash.trim() || !reason.trim() || !serials.trim()) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await createRecall({
        batchHash: batchHash.trim(),
        reason: reason.trim(),
        serials: serials.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setSuccess(`Lệnh thu hồi đã được tạo on-chain. TX: ${data.txHash}`);
      setBatchHash("");
      setReason("");
      setSerials("");
      qc.invalidateQueries({ queryKey: ["recalls"] });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Tạo lệnh thu hồi thất bại."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Form */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-5 border-b border-zinc-100 pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="font-bold text-zinc-900">Phát lệnh thu hồi</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Chỉ cơ quan có thẩm quyền mới có thể thực hiện. Smart contract sẽ được gọi.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Batch Hash hoặc Batch ID">
            <input
              className={`${inputCls} font-mono`}
              value={batchHash}
              onChange={(e) => setBatchHash(e.target.value)}
              placeholder="0x… hoặc BATCH-VCN-…"
            />
          </Field>
          <Field label="Lý do thu hồi">
            <input
              className={inputCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vd: Lỗi chuỗi lạnh"
            />
          </Field>
          <Field label="Serial IDs (phân cách bằng dấu phẩy)">
            <textarea
              className={`${inputCls} min-h-[80px]`}
              value={serials}
              onChange={(e) => setSerials(e.target.value)}
              placeholder="VCN-001, VCN-002, VCN-003"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 break-all">
            {success}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isBusy || !batchHash.trim() || !reason.trim() || !serials.trim()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          <AlertTriangle className="h-4 w-4" />
          {isBusy ? "Đang xử lý…" : "THU HỒI LÔ HÀNG"}
        </button>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-red-500" />
            <h2 className="font-semibold text-zinc-800">
              Lịch sử thu hồi
              {recalls.length > 0 && (
                <span className="ml-2 font-normal text-zinc-400">({recalls.length})</span>
              )}
            </h2>
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["recalls"] })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />)}
          </div>
        ) : recalls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
            <RotateCcw className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
            <p className="text-sm text-zinc-400">Chưa có lệnh thu hồi nào.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recalls.map((recall) => (
              <RecallCard key={recall.id || recall.batchHash} recall={recall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

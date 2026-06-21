"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWriteContract } from "wagmi";
import { AlertTriangle, CheckSquare, RefreshCw, RotateCcw, ShieldAlert, Square } from "lucide-react";
import { createRecall, getApiErrorMessage, getBatches, getRecalls, getRiskFlags, syncWalletRecall } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import type { Batch, RecallRecord, RiskFlag } from "@/lib/types";
import { getProductRegistryAddress, productRegistryAbi, toBytes32 } from "@/lib/wallet-contracts";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

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

function RecallCard({ recall }: { recall: RecallRecord }) {
  const t = useTranslation();
  const { language } = useLanguage();

  return (
    <div className="space-y-3 rounded-xl border border-l-4 border-zinc-200 border-l-red-500 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Batch Hash</p>
          <p className="mt-0.5 break-all font-mono text-xs text-zinc-700">{recall.batchHash}</p>
        </div>
        <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
          {t("Thu hồi")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-sm">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t("Lý do")}</p>
          <p className="mt-0.5 font-semibold text-zinc-800">{recall.reason || recall.reasonHash}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t("Serial ảnh hưởng")}</p>
          <p className="mt-0.5 font-semibold text-zinc-800">{recall.serialsAffected ?? "-"}</p>
        </div>
      </div>
      {(recall.txHash || recall.blockchainTx) && (
        <p className="break-all font-mono text-[10px] text-zinc-400">
          TX: {recall.txHash || recall.blockchainTx}
        </p>
      )}
      {recall.createdAt && (
        <p className="text-xs text-zinc-400">{new Date(recall.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN")}</p>
      )}
    </div>
  );
}

type FlaggedBatchGroup = {
  batchId: string;
  batchHash: string;
  productName: string;
  flags: RiskFlag[];
  serials: string[];
};

function FlaggedBatchesSection({
  onPrefill,
}: {
  onPrefill: (batchHash: string, serials: string[]) => void;
}) {
  const t = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: riskFlags = [], isLoading: flagsLoading } = useQuery<RiskFlag[]>({
    queryKey: ["risk-flags"],
    queryFn: getRiskFlags,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["batches"],
    queryFn: getBatches,
  });

  const batchMap = Object.fromEntries(batches.map((b) => [b.id, b]));

  const groups: FlaggedBatchGroup[] = [];
  const seen = new Map<string, FlaggedBatchGroup>();

  for (const flag of riskFlags) {
    if (!flag.serialId) continue;
    const batchId = flag.batchId || "";
    const batch = batchMap[batchId];
    const batchHash = batch?.batchHash || batchId;
    const productName = batch?.productName || batchId || flag.serialId;
    const key = batchHash || batchId;
    if (!key) continue;

    if (!seen.has(key)) {
      const g: FlaggedBatchGroup = { batchId, batchHash, productName, flags: [], serials: [] };
      seen.set(key, g);
      groups.push(g);
    }
    const g = seen.get(key)!;
    g.flags.push(flag);
    if (flag.serialId && !g.serials.includes(flag.serialId)) {
      g.serials.push(flag.serialId);
    }
  }

  const isLoading = flagsLoading || batchesLoading;

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          <h3 className="font-bold text-zinc-900">{t("Lô bị cảnh báo")}</h3>
          {groups.length > 0 && (
            <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
              {groups.length}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["risk-flags"] });
            qc.invalidateQueries({ queryKey: ["batches"] });
          }}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <p className="mb-3 text-xs text-zinc-500">{t("Chọn lô bị cảnh báo để điền vào form thu hồi.")}</p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-orange-100" />)}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">{t("Chưa có lô nào bị cảnh báo.")}</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const isSelected = selected === g.batchHash;
            return (
              <div
                key={g.batchHash}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-orange-400 bg-orange-100"
                    : "border-orange-200 bg-white hover:bg-orange-50"
                }`}
                onClick={() => setSelected(isSelected ? null : g.batchHash)}
              >
                <span className="mt-0.5 shrink-0 text-orange-500">
                  {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-zinc-800 truncate">{g.productName}</p>
                  <p className="font-mono text-[10px] text-zinc-400 truncate">{g.batchHash || g.batchId}</p>
                  <p className="mt-0.5 text-xs text-orange-600">
                    {g.flags.length} {t("cảnh báo")} · {g.serials.length} serial
                  </p>
                </div>
                {isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrefill(g.batchHash || g.batchId, g.serials);
                    }}
                    className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600"
                  >
                    {t("Điền vào form")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RecallPage() {
  const qc = useQueryClient();
  const t = useTranslation();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: recalls = [], isLoading } = useQuery<RecallRecord[]>({
    queryKey: ["recalls"],
    queryFn: getRecalls,
  });

  const [batchHash, setBatchHash] = useState("");
  const [serials, setSerials] = useState("");
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePrefill = (hash: string, serialList: string[]) => {
    setBatchHash(hash);
    setSerials(serialList.join(", "));
    setError(null);
    setSuccess(null);
  };

  const submit = async () => {
    if (!batchHash.trim() || !reason.trim() || !serials.trim()) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        batchHash: batchHash.trim(),
        reason: reason.trim(),
        serials: serials.split(",").map((s) => s.trim()).filter(Boolean),
      };
      let data;
      const user = getStoredUser();
      if (user?.authMode === "wallet") {
        if (!publicClient) throw new Error(t("Chưa sẵn sàng kết nối Sepolia."));
        const txHash = await writeContractAsync({
          address: getProductRegistryAddress(),
          abi: productRegistryAbi,
          functionName: "recallBatch",
          args: [toBytes32(payload.batchHash), toBytes32(payload.reason)],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        data = await syncWalletRecall({ ...payload, txHash });
      } else {
        data = await createRecall(payload);
      }
      setSuccess(`${t("Lệnh thu hồi đã được tạo on-chain.")} TX: ${data.txHash || data.blockchainTx || "N/A"}`);
      setBatchHash("");
      setReason("");
      setSerials("");
      qc.invalidateQueries({ queryKey: ["recalls"] });
      qc.invalidateQueries({ queryKey: ["risk-flags"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Tạo lệnh thu hồi thất bại.")));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-5 border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h2 className="font-bold text-zinc-900">{t("Phát lệnh thu hồi")}</h2>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {t("Chỉ cơ quan có thẩm quyền mới có thể thực hiện. Smart contract sẽ được gọi.")}
              </p>
            </div>

            <div className="space-y-4">
              <Field label={t("Batch Hash hoặc Batch ID")}>
                <input
                  className={`${inputCls} font-mono`}
                  value={batchHash}
                  onChange={(e) => setBatchHash(e.target.value)}
                  placeholder="0x... hoặc BATCH-VCN-..."
                />
              </Field>
              <Field label={t("Lý do thu hồi")}>
                <input
                  className={inputCls}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("Ví dụ: Lỗi chuỗi lạnh")}
                />
              </Field>
              <Field label={t("Serial IDs phân cách bằng dấu phẩy")}>
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
              <div className="mt-4 break-all rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {success}
              </div>
            )}

            <button
              onClick={submit}
              disabled={isBusy || !batchHash.trim() || !reason.trim() || !serials.trim()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <AlertTriangle className="h-4 w-4" />
              {isBusy ? t("Đang xử lý...") : t("Thu hồi lô hàng")}
            </button>
          </div>

          <FlaggedBatchesSection onPrefill={handlePrefill} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold text-zinc-800">
                {t("Lịch sử thu hồi")}
                {recalls.length > 0 && (
                  <span className="ml-2 font-normal text-zinc-400">({recalls.length})</span>
                )}
              </h2>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["recalls"] })}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              aria-label={t("Làm mới")}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />)}
            </div>
          ) : recalls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-800">
              <RotateCcw className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
              <p className="text-sm text-zinc-400">{t("Chưa có lệnh thu hồi nào.")}</p>
            </div>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-13rem)]">
              {recalls.map((recall) => (
                <RecallCard key={recall.id || recall.batchHash} recall={recall} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

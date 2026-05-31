"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ArrowRight, CheckCircle2, ExternalLink, ListChecks, RefreshCw, Truck, XCircle } from "lucide-react";
import { confirmTransfer, getApiErrorMessage, getDemoActors, getTransfers, rejectTransfer, scanTransfer, syncWalletTransferCreate } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { TransferRecord } from "@/lib/types";
import {
  allowedTransferRoutes,
  getZodFieldErrors,
  transferConfirmFormSchema,
  transferInitiatorRoles,
  transferReceiverRoles,
  transferRejectFormSchema,
  transferScanFormSchema,
} from "@/lib/validation";
import { getTransferLedgerAddress, toBytes32, transferLedgerAbi } from "@/lib/wallet-contracts";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

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

const fromRoleOptions = [...transferInitiatorRoles];

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";
const safeIdPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const safeIdMessage = "Chỉ dùng chữ, số, dấu chấm, gạch dưới, dấu hai chấm hoặc gạch ngang.";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function TransferList() {
  const tLabel = useTranslation();
  const { language } = useLanguage();
  const qc = useQueryClient();
  const { data: transfers = [], isLoading } = useQuery<TransferRecord[]>({
    queryKey: ["transfers"],
    queryFn: getTransfers,
    refetchInterval: 8000,
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (serialId: string) => {
    setBusy(true);
    setError(null);
    try {
      const parsed = transferConfirmFormSchema.safeParse({ serialId });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setError(Object.values(errors)[0] || "Serial của lệnh chuyển không hợp lệ.");
        return;
      }

      await confirmTransfer(parsed.data.serialId);
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Xác nhận thất bại."));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (serialId: string) => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = transferRejectFormSchema.safeParse({ serialId, rejectionReason: rejectReason });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setError(Object.values(errors)[0] || tLabel("Vui lòng nhập lý do từ chối hợp lệ."));
        return;
      }

      await rejectTransfer(parsed.data.serialId, parsed.data.rejectionReason);
      setRejectingId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Từ chối thất bại."));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
        <Truck className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
        <p className="text-sm text-zinc-400">{tLabel("Chưa có lệnh chuyển nào.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {transfers.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-zinc-700 truncate">{t.serialId}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {translateRole(t.fromRole || "", language) || tLabel("Không rõ")} <ArrowRight className="inline h-3 w-3" /> {translateRole(t.toRole || "", language) || tLabel("Không rõ")}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                statusChip[t.status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
              }`}
            >
              {getTransferStatusLabel(t.status, language)}
            </span>
          </div>

          {t.blockchainTx && (
            <p className="font-mono text-[10px] text-zinc-400 truncate">tx: {t.blockchainTx}</p>
          )}

          {t.status === "PENDING" ? (
            rejectingId === t.id ? (
              <div className="flex gap-2 flex-wrap">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
                  placeholder={tLabel("Lý do từ chối...")}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={busy}
                />
                <button
                  disabled={busy || !rejectReason.trim()}
                  onClick={() => handleReject(t.serialId)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {tLabel("Xác nhận từ chối")}
                </button>
                <button
                  onClick={() => { setRejectingId(null); setRejectReason(""); }}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  {tLabel("Hủy")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <button
                  disabled={busy || !transferConfirmFormSchema.safeParse({ serialId: t.serialId }).success}
                  onClick={() => handleConfirm(t.serialId)}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {tLabel("Xác nhận")}
                </button>
                <button
                  disabled={busy || !transferRejectFormSchema.safeParse({ serialId: t.serialId, rejectionReason: "valid reason" }).success}
                  onClick={() => setRejectingId(t.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> {tLabel("Từ chối")}
                </button>
                <Link
                  href={`/dashboard/transfers/${encodeURIComponent(t.id)}`}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  <ExternalLink className="h-3 w-3" /> {tLabel("Chi tiết")}
                </Link>
              </div>
            )
          ) : (
            <Link
              href={`/dashboard/transfers/${encodeURIComponent(t.id)}`}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              {tLabel("Xem chi tiết")} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ScanTransferPage() {
  const t = useTranslation();
  const qc = useQueryClient();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [serialId, setSerialId] = useState("");
  const [fromRole, setFromRole] = useState("MANUFACTURER");
  const [toRole, setToRole] = useState("DISTRIBUTOR");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("serialId");
    if (s) setSerialId(s);
  }, []);

  const toRoleOptions = allowedTransferRoutes[fromRole as keyof typeof allowedTransferRoutes] || [...transferReceiverRoles];

  useEffect(() => {
    if (!toRoleOptions.includes(toRole as any)) {
      setToRole(toRoleOptions[0] || "DISTRIBUTOR");
    }
  }, [fromRole, toRole, toRoleOptions]);

  const create = async () => {
    if (!serialId.trim() || isBusy) return;
    if (!safeIdPattern.test(serialId.trim())) {
      setError(safeIdMessage);
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusMsg(`Đang tạo lệnh ${fromRole} → ${toRole} on-chain…`);
    setTxHash(null);
    try {
      const parsed = transferScanFormSchema.safeParse({ serialId, fromRole, toRole });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setFieldErrors(errors);
        setError(Object.values(errors)[0] || "Vui lòng kiểm tra các trường đang báo lỗi.");
        setStatusMsg(null);
        return;
      }

      let data;
      const user = getStoredUser();
      if (user?.authMode === "wallet") {
        if (!address) throw new Error("Chua ket noi MetaMask.");
        if (!publicClient) throw new Error("Chua san sang ket noi Sepolia.");
        const actors = await getDemoActors();
        const receiverAddress = actors.find((actor) => actor.role === parsed.data.toRole)?.address;
        if (!receiverAddress) throw new Error(`Chua co dia chi nhan cho role ${parsed.data.toRole}.`);
        const txHash = await writeContractAsync({
          address: getTransferLedgerAddress(),
          abi: transferLedgerAbi,
          functionName: "createTransferRequest",
          args: [
            toBytes32(parsed.data.serialId),
            receiverAddress as `0x${string}`,
            toBytes32(`from:${address}`),
            toBytes32(`to:${receiverAddress}`),
          ],
        });
        setStatusMsg("Da gui giao dich. Dang cho Sepolia xac nhan...");
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        data = await syncWalletTransferCreate({
          ...parsed.data,
          receiverAddress,
          fromLocationHash: toBytes32(`from:${address}`),
          toLocationHash: toBytes32(`to:${receiverAddress}`),
          txHash,
        });
      } else {
        data = await scanTransfer(parsed.data);
      }
      setTxHash(data.txHash ?? null);
      setTransferId(data.transfer?.id ?? null);
      setStatusMsg("Đã tạo lệnh. Xác nhận giao hàng ở danh sách bên phải.");
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Tạo lệnh thất bại."));
      setStatusMsg(null);
    } finally {
      setIsBusy(false);
    }
  };

  const confirm = async () => {
    if (!serialId.trim() || isBusy) return;
    if (!safeIdPattern.test(serialId.trim())) {
      setError(safeIdMessage);
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusMsg(`Đang xác nhận giao hàng cho ${toRole}…`);
    setTxHash(null);
    try {
      const parsed = transferConfirmFormSchema.safeParse({ serialId });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setFieldErrors(errors);
        setError(Object.values(errors)[0] || "Vui lòng kiểm tra các trường đang báo lỗi.");
        setStatusMsg(null);
        return;
      }

      const data = await confirmTransfer(parsed.data.serialId);
      setTxHash(data.txHash ?? null);
      setTransferId(data.transferId ?? transferId);
      setStatusMsg("Xác nhận thành công.");
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Xác nhận thất bại."));
      setStatusMsg(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{t("Tạo lệnh")}</h1>
          <p className="text-sm text-zinc-500">{t("Ghi nhận chuyển giao vaccine lên blockchain.")}</p>
        </div>
        <Link
          href="/dashboard/transfers"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <ListChecks className="h-4 w-4" />
          {t("Lệnh")}
        </Link>
      </div>

    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Form tạo lệnh chuyển giao */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-5 border-b border-zinc-100 pb-4">
            <h2 className="font-bold text-zinc-900">{t("Tạo lệnh chuyển giao")}</h2>
            <p className="text-xs text-zinc-500">{t("Ghi nhận chuyển giao vaccine lên blockchain.")}</p>
        </div>

        <div className="space-y-4">
          <Field label="Serial ID">
            <input
              className={`${inputCls} font-mono`}
              value={serialId}
              onChange={(e) => {
                setFieldErrors({});
                setSerialId(e.target.value);
              }}
              placeholder="VCN-…"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Từ">
              <select
                className={inputCls}
                value={fromRole}
                onChange={(e) => {
                  setFieldErrors({});
                  setFromRole(e.target.value);
                }}
              >
                {fromRoleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Đến">
              <select
                className={inputCls}
                value={toRole}
                onChange={(e) => {
                  setFieldErrors({});
                  setToRole(e.target.value);
                }}
              >
                {toRoleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Status */}
        {statusMsg && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            {statusMsg}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
            {Object.keys(fieldErrors).length > 0 ? (
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(fieldErrors).map(([field, validationMessage]) => (
                  <li key={field}>
                    {field}: {validationMessage}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {txHash && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
            <p className="font-semibold text-emerald-800">Transaction Hash</p>
            <p className="mt-0.5 break-all font-mono text-emerald-700">{txHash}</p>
            {transferId && (
              <Link
                href={`/dashboard/transfers/${encodeURIComponent(transferId)}`}
                className="mt-1 flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
              >
                {t("Xem chi tiết lệnh")} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            disabled={isBusy || !serialId.trim()}
            onClick={create}
            className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isBusy ? t("Đang xử lý...") : t("Tạo lệnh")}
          </button>
          <button
            disabled={isBusy || !serialId.trim()}
            onClick={confirm}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t("Xác nhận giao")}
          </button>
          <Link
            href={serialId ? `/dashboard/verify/${encodeURIComponent(serialId)}` : "/dashboard/products"}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Verify
          </Link>
        </div>
      </div>

      {/* Danh sách lệnh chuyển giao */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-500" />
            <h2 className="font-semibold text-zinc-800">{t("Lệnh gần đây")}</h2>
          </div>
          <Link
            href="/dashboard/transfers"
            className="flex min-h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            {t("Xem tất cả")} <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["transfers"] })}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        <TransferList />
      </div>
    </div>
    </div>
  );
}

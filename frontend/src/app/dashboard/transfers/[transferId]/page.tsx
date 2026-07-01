"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, ExternalLink, XCircle } from "lucide-react";
import { clearStaleTransfer, confirmBatchShellTransfer, confirmTransfer, getApiErrorMessage, getTransfer, rejectBatchShellTransfer, rejectTransfer, syncWalletTransferConfirm, syncWalletTransferReject } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { getStatusChipClass, getTransferStatusLabel } from "@/lib/status";
import type { TransferRecord } from "@/lib/types";
import { getTransferLedgerAddress, toBytes32, transferLedgerAbi } from "@/lib/wallet-contracts";
import { canInitiateTransfer, isAdminAuthority, isEndUserRole } from "@/lib/role-access";
import { translateRole } from "@/lib/i18n";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { ActionSpinner } from "@/components/ui/ActionSpinner";

interface PageProps {
  params: Promise<{ transferId: string }>;
}

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

function TxLink({ hash, label = "Mở transaction" }: { hash?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

type ActionNotice = {
  tone: "success" | "error" | "warning";
  title: string;
  description: string;
  txHash?: string;
  txLabel?: string;
  meta?: Array<{ label: string; value?: string | null }>;
};

function ActionNoticeCard({ notice }: { notice: ActionNotice }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[notice.tone];
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "warning" ? Clock : AlertTriangle;
  const meta = (notice.meta || []).filter((item) => item.value);

  return (
    <div className={`rounded-xl border p-4 text-sm shadow-sm ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{notice.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{notice.description}</p>
          {meta.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {meta.map((item) => (
                <div key={item.label} className="rounded-lg bg-white/60 px-3 py-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">{item.label}</p>
                  <p className="mt-0.5 break-all font-mono text-xs font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {notice.txHash ? <div className="mt-3"><TxLink hash={notice.txHash} label={notice.txLabel} /></div> : null}
        </div>
      </div>
    </div>
  );
}

function IpfsLink({ cid }: { cid?: string }) {
  if (!cid) return null;
  return (
    <a
      href={`https://gateway.pinata.cloud/ipfs/${cid}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Mở IPFS
    </a>
  );
}

function sameAddress(left?: string, right?: string) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function isBatchLikeSerial(value?: string) {
  return /^BATCH[-_:]/i.test(String(value || "").trim());
}

function actionResultMeta(result: { txHash?: string; jobId?: string; transferId?: string; serialId?: string }, transfer: TransferRecord, t: (key: string) => string) {
  return [
    { label: transfer.offChainOnly ? "Batch" : "Serial", value: transfer.offChainOnly ? transfer.batchId : result.serialId || transfer.serialId },
    { label: t("Lô"), value: transfer.batchId },
    { label: "Job ID", value: result.jobId },
    { label: "Transfer ID", value: result.transferId || transfer.id },
  ];
}

function isBatchShellTransfer(transfer: TransferRecord) {
  return !!(transfer.offChainOnly || transfer.transferMode === "OFF_CHAIN_BATCH_CUSTODY" || transfer.mode === "OFF_CHAIN_BATCH_CUSTODY");
}

export default function TransferDetailPage({ params }: PageProps) {
  const { transferId } = use(params);
  const decoded = decodeURIComponent(transferId);
  const qc = useQueryClient();
  const t = useTranslation();
  const { language } = useLanguage();
  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [staleTransferDetected, setStaleTransferDetected] = useState(false);
  const [user] = useState<DemoUser | null>(() => (typeof window === "undefined" ? null : getStoredUser()));

  const { data: transfer, isLoading } = useQuery<TransferRecord | undefined>({
    queryKey: ["transfer", decoded],
    queryFn: () => getTransfer(decoded),
    refetchInterval: (query) => query.state.data?.status === "PROCESSING" ? 8000 : false,
  });

  const handleConfirm = async () => {
    if (!transfer || busy) return;
    setBusy(true);
    setActionNotice(null);
    setStaleTransferDetected(false);
    try {
      let result;
      if (isBatchShellTransfer(transfer)) {
        const updated = await confirmBatchShellTransfer(transfer.id);
        result = { transferId: updated.id, serialId: updated.serialId };
      } else if (user?.authMode === "wallet" && sameAddress(user.address, transfer.toAddress)) {
        if (!sameAddress(connectedAddress, transfer.toAddress)) {
          throw new Error("MetaMask đang chọn sai ví. Hãy chuyển sang ví nhận lệnh trước khi xác nhận.");
        }
        if (!publicClient) throw new Error("Chua san sang ket noi Sepolia.");
        const txHash = await writeContractAsync({
          address: getTransferLedgerAddress(),
          abi: transferLedgerAbi,
          functionName: "confirmTransfer",
          args: [toBytes32(transfer.serialId), toBytes32(transfer.toLocationHash || `to:${transfer.toAddress}`)],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        result = await syncWalletTransferConfirm(transfer.serialId, txHash);
      } else {
        result = await confirmTransfer(transfer.serialId);
      }
      setActionNotice({
        tone: "success",
        title: result.txHash ? t("Đã xác nhận giao hàng") : t("Đã gửi yêu cầu xác nhận"),
        description: result.txHash
          ? t("Lệnh chuyển đã được xác nhận và quyền sở hữu sẽ được đồng bộ về web.")
          : isBatchShellTransfer(transfer)
            ? t("Lệnh chuyển đã được xác nhận thành công.")
            : t("Backend đã đưa lệnh xác nhận vào hàng đợi. Trạng thái sẽ tự cập nhật khi hoàn tất."),
        txHash: result.txHash,
        txLabel: t("Mở transaction"),
        meta: actionResultMeta(result, transfer, t),
      });
      qc.invalidateQueries({ queryKey: ["transfer", decoded] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: unknown) {
      setActionNotice({
        tone: "error",
        title: t("Không thể xác nhận giao hàng"),
        description: getApiErrorMessage(err, t("Xác nhận thất bại.")),
        meta: [{ label: isBatchShellTransfer(transfer) ? "Batch" : "Serial", value: isBatchShellTransfer(transfer) ? transfer.batchId : transfer.serialId }, { label: t("Lô"), value: transfer.batchId }],
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!transfer || !rejectReason.trim() || busy) return;
    setBusy(true);
    setActionNotice(null);
    setStaleTransferDetected(false);
    try {
      let result;
      if (isBatchShellTransfer(transfer)) {
        const updated = await rejectBatchShellTransfer(transfer.id, rejectReason.trim());
        result = { transferId: updated.id, serialId: updated.serialId };
      } else if (user?.authMode === "wallet" && sameAddress(user.address, transfer.toAddress)) {
        if (!sameAddress(connectedAddress, transfer.toAddress)) {
          throw new Error("MetaMask đang chọn sai ví. Hãy chuyển sang ví nhận lệnh trước khi từ chối.");
        }
        if (!publicClient) throw new Error("Chua san sang ket noi Sepolia.");
        const txHash = await writeContractAsync({
          address: getTransferLedgerAddress(),
          abi: transferLedgerAbi,
          functionName: "rejectTransfer",
          args: [toBytes32(transfer.serialId), toBytes32(rejectReason.trim())],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        result = await syncWalletTransferReject(transfer.serialId, rejectReason.trim(), txHash);
      } else {
        result = await rejectTransfer(transfer.serialId, rejectReason.trim());
      }
      setActionNotice({
        tone: "success",
        title: result.txHash ? t("Đã từ chối lệnh chuyển") : t("Đã gửi yêu cầu từ chối"),
        description: result.txHash
          ? t("Lệnh chuyển đã bị từ chối và sản phẩm sẽ được trả về bên gửi.")
          : isBatchShellTransfer(transfer)
            ? t("Lệnh chuyển đã bị từ chối.")
            : t("Backend đã đưa yêu cầu từ chối vào hàng đợi. Trạng thái sẽ tự cập nhật khi hoàn tất."),
        txHash: result.txHash,
        txLabel: t("Mở transaction"),
        meta: [
          ...actionResultMeta(result, transfer, t),
          { label: t("Lý do"), value: rejectReason.trim() },
        ],
      });
      setShowRejectForm(false);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["transfer", decoded] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      if (code === "ON_CHAIN_PENDING_TRANSFER_NOT_FOUND") {
        setStaleTransferDetected(true);
      }
      setActionNotice({
        tone: "error",
        title: t("Không thể từ chối lệnh chuyển"),
        description: getApiErrorMessage(err, t("Từ chối thất bại.")),
        meta: [{ label: isBatchShellTransfer(transfer) ? "Batch" : "Serial", value: isBatchShellTransfer(transfer) ? transfer.batchId : transfer.serialId }, { label: t("Lô"), value: transfer.batchId }],
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearStale = async () => {
    if (!transfer || busy) return;
    setBusy(true);
    setActionNotice(null);
    try {
      const result = await clearStaleTransfer(transfer.id);
      setActionNotice({
        tone: "success",
        title: t("Đã dọn lệnh stale"),
        description: t("Firebase đã được đưa về trạng thái nhất quán để lệnh lỗi không còn chặn thao tác tiếp theo."),
        meta: [
          { label: "Serial", value: result.serialId },
          { label: t("Quyền sở hữu trả về"), value: result.restoredRole },
          { label: "Transfer ID", value: result.transferId },
        ],
      });
      setStaleTransferDetected(false);
      qc.invalidateQueries({ queryKey: ["transfer", decoded] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    } catch (err: unknown) {
      setActionNotice({
        tone: "error",
        title: t("Không thể dọn lệnh stale"),
        description: getApiErrorMessage(err, t("Không thể dọn lệnh stale")),
      });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-100 text-2xl">📋</div>
        <p className="font-bold text-zinc-800">{t("Không tìm thấy lệnh chuyển")}</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decoded}</p>
        <Link href="/dashboard/transfers" className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("Quay lại danh sách")}
        </Link>
      </div>
    );
  }

  const assignedRoles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const canAct =
    transfer.status === "PENDING" &&
    (assignedRoles.has(transfer.toRole) || isAdminAuthority(user));
  const canCreateTransfer = canInitiateTransfer(user);
  const endUser = isEndUserRole(user);
  const batchShell = isBatchShellTransfer(transfer);

  return (
    <div className="max-w-3xl space-y-5 pb-20 lg:pb-0">
      <Link href="/dashboard/transfers" className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("Lệnh chuyển giao")}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <span className={`rounded-full border px-4 py-1.5 text-sm font-bold ${getStatusChipClass(transfer.status)}`}>
          {getTransferStatusLabel(transfer.status)}
        </span>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{batchShell ? "Batch ID" : "Serial ID"}</p>
          <p className="font-mono text-sm font-semibold text-zinc-800">{batchShell ? transfer.batchId : transfer.serialId}</p>
        </div>
      </div>

      {(transfer.status === "REJECTED" || transfer.status === "RETURNED") && transfer.rejectedReason ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-bold">{t("Lý do từ chối")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{transfer.rejectedReason}</p>
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t("Từ")}</p>
          <p className="mt-1 font-bold text-zinc-800">{translateRole(transfer.fromRole, language)}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{transfer.fromAddress?.slice(0, 6)}...{transfer.fromAddress?.slice(-4)}</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" />
        <div className="flex-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t("Đến")}</p>
          <p className="mt-1 font-bold text-zinc-800">{translateRole(transfer.toRole, language)}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{transfer.toAddress?.slice(0, 6)}...{transfer.toAddress?.slice(-4)}</p>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <MetaField label={t("Mã lô")} value={transfer.batchId} mono />
        <MetaField label="Blockchain TX" value={transfer.blockchainTx} mono />
        <MetaField label="IPFS CID" value={transfer.ipfsCid} mono />
        <MetaField label={t("Lý do từ chối")} value={transfer.rejectedReason} />
        <MetaField label={t("Tạo lúc")} value={transfer.createdAt ? new Date(transfer.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN") : undefined} />
        <MetaField label={t("Cập nhật lúc")} value={transfer.updatedAt ? new Date(transfer.updatedAt).toLocaleString(language === "en" ? "en-US" : "vi-VN") : undefined} />
      </div>

      {(transfer.blockchainTx || transfer.ipfsCid) && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <TxLink hash={transfer.blockchainTx} label={t("Mở transaction")} />
          <IpfsLink cid={transfer.ipfsCid} />
        </div>
      )}

      {transfer.status === "PENDING" && canAct && (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="border-b border-zinc-100 pb-3 font-bold text-zinc-900">{t("Thao tác")}</h2>

          {actionNotice ? <ActionNoticeCard notice={actionNotice} /> : null}
          {staleTransferDetected && isAdminAuthority(user) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-bold">{t("Lệnh này bị lệch Firebase và smart contract.")}</p>
              <p className="mt-1">{t("Contract hiện tại không còn pending transfer cho serial này, nên không thể từ chối on-chain. Admin có thể dọn lệnh stale để trả sản phẩm về bên gửi và gỡ trạng thái chờ.")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={handleClearStale}
                className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {t("Dọn lệnh stale")}
              </button>
            </div>
          ) : null}

          {showRejectForm ? (
            <div className="space-y-3">
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={t("Nhập lý do từ chối...")}
              />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !rejectReason.trim()} onClick={handleReject} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {busy ? <ActionSpinner label={t("Đang xử lý...")} /> : <><XCircle className="h-4 w-4" /> {t("Xác nhận từ chối")}</>}
                </button>
                <button onClick={() => { setShowRejectForm(false); setRejectReason(""); }} className="min-h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                  {t("Hủy")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={handleConfirm} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <ActionSpinner label={t("Đang xử lý...")} /> : <><CheckCircle2 className="h-4 w-4" /> {t("Xác nhận giao hàng")}</>}
              </button>
              <button disabled={busy} onClick={() => setShowRejectForm(true)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
                {busy ? <ActionSpinner label={t("Đang xử lý...")} /> : <><XCircle className="h-4 w-4" /> {t("Từ chối lệnh")}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {transfer.status === "PROCESSING" && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{t("Lệnh đã được ghi nhận.")}</p>
            <p className="mt-1 font-normal opacity-80">{t("Trang sẽ tự cập nhật. Không cần thao tác thêm.")}</p>
          </div>
        </div>
      )}

      {transfer.status === "PENDING" && !canAct && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {language === "en"
            ? `Waiting for ${translateRole(transfer.toRole, "en")} to confirm or reject this transfer.`
            : `Đang chờ ${translateRole(transfer.toRole, "vi")} xác nhận hoặc từ chối lệnh chuyển này.`}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!batchShell ? (
          <Link href={`/dashboard/verify/${encodeURIComponent(transfer.serialId)}`} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            <ExternalLink className="h-3.5 w-3.5" /> {t("Xác minh sản phẩm")}
          </Link>
        ) : null}
        <Link href="/dashboard/transfers" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
          <ArrowLeft className="h-3.5 w-3.5" /> {endUser ? t("Lô chờ nhận") : t("Tất cả lệnh")}
        </Link>
        {canCreateTransfer ? (
          <Link
            href={batchShell ? `/dashboard/transfers/create?batchId=${encodeURIComponent(transfer.batchId || "")}&autoSelect=all` : `/dashboard/transfers/create?serialId=${encodeURIComponent(transfer.serialId)}`}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowRight className="h-3.5 w-3.5" /> {t("Tạo lệnh chuyển")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}


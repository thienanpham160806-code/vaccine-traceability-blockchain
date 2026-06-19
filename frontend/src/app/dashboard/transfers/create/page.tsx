"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ArrowRight, CheckCircle2, ExternalLink, ListChecks, RefreshCw, Truck, XCircle } from "lucide-react";
import { confirmTransfer, getApiErrorMessage, getDemoActors, getTransferableProducts, getTransfers, rejectTransfer, scanTransfer, syncWalletTransferConfirm, syncWalletTransferCreate, syncWalletTransferReject } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { Product, TransferRecord } from "@/lib/types";
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

const fromRoleOptions = [...transferInitiatorRoles];
type TransferInitiatorRole = (typeof transferInitiatorRoles)[number];
type TransferReceiverRole = (typeof transferReceiverRoles)[number];

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";
const safeIdPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const safeIdMessage = "Chỉ dùng chữ, số, dấu chấm, gạch dưới, dấu hai chấm hoặc gạch ngang.";

function isInitiatorRole(value: string): value is TransferInitiatorRole {
  return (transferInitiatorRoles as readonly string[]).includes(value);
}

function isReceiverRole(value: string): value is TransferReceiverRole {
  return (transferReceiverRoles as readonly string[]).includes(value);
}

function getInitialTransferForm() {
  if (typeof window === "undefined") {
    return { serialId: "", fromRole: "MANUFACTURER" as TransferInitiatorRole };
  }

  const params = new URLSearchParams(window.location.search);
  const user = getStoredUser();
  return {
    serialId: params.get("serialId") || "",
    fromRole: user?.role && isInitiatorRole(user.role) ? user.role : ("MANUFACTURER" as TransferInitiatorRole),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function normalizeAddress(address?: string) {
  return String(address || "").trim().toLowerCase();
}

function canRoleInitiateTransfer(role?: string) {
  return Boolean(role && transferInitiatorRoles.includes(role as any));
}

function groupProductsByBatch(products: Product[]) {
  const groups = new Map<string, {
    batchId: string;
    productName: string;
    manufacturerName: string;
    products: Product[];
  }>();

  products.forEach((product) => {
    const batchId = product.batchId || product.batchHash || "UNKNOWN_BATCH";
    const current = groups.get(batchId);
    if (current) {
      current.products.push(product);
      return;
    }

    groups.set(batchId, {
      batchId,
      productName: product.productName || "Unknown product",
      manufacturerName: product.manufacturerName || "Unknown manufacturer",
      products: [product],
    });
  });

  return Array.from(groups.values()).sort((a, b) => b.products.length - a.products.length);
}

function TransferList() {
  const tLabel = useTranslation();
  const { language } = useLanguage();
  const qc = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: allTransfers = [], isLoading } = useQuery<TransferRecord[]>({
    queryKey: ["transfers"],
    queryFn: getTransfers,
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const FULL_ACCESS_ROLES = ["ADMIN", "AUDITOR", "RECALL_AUTHORITY"];
  const storedUser = getStoredUser();
  const transfers =
    storedUser?.role && !FULL_ACCESS_ROLES.includes(storedUser.role)
      ? allTransfers.filter(
          (t) => t.fromRole === storedUser.role || t.toRole === storedUser.role
        )
      : allTransfers;

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
        setError(Object.values(errors)[0] || tLabel("Serial của lệnh chuyển không hợp lệ."));
        return;
      }

      const transfer = transfers.find((item) => item.serialId === parsed.data.serialId && item.status === "PENDING");
      const shouldUseWallet = storedUser?.authMode === "wallet" && normalizeAddress(storedUser.address) === normalizeAddress(transfer?.toAddress);
      if (shouldUseWallet) {
        if (!publicClient) throw new Error(tLabel("Chưa sẵn sàng kết nối Sepolia."));
        if (!transfer) throw new Error(tLabel("Không tìm thấy lệnh chờ xác nhận."));
        const txHash = await writeContractAsync({
          address: getTransferLedgerAddress(),
          abi: transferLedgerAbi,
          functionName: "confirmTransfer",
          args: [toBytes32(transfer.serialId), toBytes32(transfer.toLocationHash || `to:${transfer.toAddress}`)],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        await syncWalletTransferConfirm(parsed.data.serialId, txHash);
      } else {
        await confirmTransfer(parsed.data.serialId);
      }
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
  } catch (err: unknown) {
      setError(getApiErrorMessage(err, tLabel("Xác nhận thất bại.")));
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

      const transfer = transfers.find((item) => item.serialId === parsed.data.serialId && item.status === "PENDING");
      const shouldUseWallet = storedUser?.authMode === "wallet" && normalizeAddress(storedUser.address) === normalizeAddress(transfer?.toAddress);
      if (shouldUseWallet) {
        if (!publicClient) throw new Error(tLabel("Chưa sẵn sàng kết nối Sepolia."));
        if (!transfer) throw new Error(tLabel("Không tìm thấy lệnh chờ từ chối."));
        const txHash = await writeContractAsync({
          address: getTransferLedgerAddress(),
          abi: transferLedgerAbi,
          functionName: "rejectTransfer",
          args: [toBytes32(transfer.serialId), toBytes32(parsed.data.rejectionReason)],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        await syncWalletTransferReject(parsed.data.serialId, parsed.data.rejectionReason, txHash);
      } else {
        await rejectTransfer(parsed.data.serialId, parsed.data.rejectionReason);
      }
      setRejectingId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
  } catch (err: unknown) {
      setError(getApiErrorMessage(err, tLabel("Từ chối thất bại.")));
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

          {(t.status === "REJECTED" || t.status === "RETURNED") && t.rejectedReason ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <p className="font-bold">{tLabel("Lý do từ chối")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{t.rejectedReason}</p>
            </div>
          ) : null}

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
  const { language } = useLanguage();
  const qc = useQueryClient();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const initialTransferForm = useMemo(() => getInitialTransferForm(), []);
  const [serialId, setSerialId] = useState(initialTransferForm.serialId);
  const [fromRole, setFromRole] = useState<TransferInitiatorRole>(initialTransferForm.fromRole);
  const [toRole, setToRole] = useState<TransferReceiverRole>("DISTRIBUTOR");
  const [fromLocation, setFromLocation] = useState("");
  const [user, setUser] = useState<DemoUser | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser?.role && isInitiatorRole(storedUser.role)) {
      setFromRole(storedUser.role);
    }

  }, []);

  const selectableFromRoles = useMemo<TransferInitiatorRole[]>(() => {
    if (user?.role === "ADMIN") return fromRoleOptions;
    return user?.role && isInitiatorRole(user.role) ? [user.role] : [];
  }, [user]);

  const {
    data: transferableInventory,
    isLoading: productsLoading,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ["transferable-products", user?.address, fromRole],
    queryFn: () => getTransferableProducts(fromRole),
    enabled: Boolean(user && (user.role === "ADMIN" || user.role === fromRole)),
    staleTime: 10_000,
  });
  const transferableProducts = transferableInventory?.items || [];

  const batchGroups = useMemo(() => groupProductsByBatch(transferableProducts), [transferableProducts]);

  const toRoleOptions = useMemo(() => allowedTransferRoutes[fromRole] || [...transferReceiverRoles], [fromRole]);
  const effectiveToRole = toRoleOptions.includes(toRole) ? toRole : toRoleOptions[0] || "DISTRIBUTOR";

  useEffect(() => {
    if (selectableFromRoles.length > 0 && !selectableFromRoles.includes(fromRole as any)) {
      setFromRole(selectableFromRoles[0]);
    }
  }, [fromRole, selectableFromRoles]);

  const create = async () => {
    if (!serialId.trim() || isBusy) return;
    if (!safeIdPattern.test(serialId.trim())) {
      setError(t(safeIdMessage));
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusMsg(`${t("Đang tạo lệnh")} ${fromRole} -> ${effectiveToRole} on-chain...`);
    setTxHash(null);
    try {
      const parsed = transferScanFormSchema.safeParse({ serialId, fromRole, toRole: effectiveToRole, fromLocation: fromLocation.trim() || undefined });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setFieldErrors(errors);
        setError(Object.values(errors)[0] || t("Vui lòng kiểm tra các trường đang báo lỗi."));
        setStatusMsg(null);
        return;
      }

      let data;
      const user = getStoredUser();
      if (user?.authMode === "wallet") {
        if (!address) throw new Error(t("Chưa kết nối MetaMask."));
        if (!publicClient) throw new Error(t("Chưa sẵn sàng kết nối Sepolia."));
        const actors = await getDemoActors();
        const receiverAddress = actors.find((actor) => actor.role === parsed.data.toRole)?.address;
        if (!receiverAddress) throw new Error(`${t("Chưa có địa chỉ nhận cho vai trò")} ${parsed.data.toRole}.`);
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
        setStatusMsg(t("Đã gửi giao dịch. Đang chờ Sepolia xác nhận..."));
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        data = await syncWalletTransferCreate({
          ...parsed.data,
          receiverAddress,
          fromLocationHash: toBytes32(`from:${address}`),
          toLocationHash: toBytes32(`to:${receiverAddress}`),
          txHash,
        });
      } else {
        data = await scanTransfer({ ...parsed.data, fromLocation: parsed.data.fromLocation });
      }
      setTxHash(data.txHash ?? null);
      setTransferId(data.transfer?.id ?? null);
      setStatusMsg(t("Đã tạo lệnh. Xác nhận giao hàng ở danh sách bên phải."));
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Tạo lệnh thất bại.")));
      setStatusMsg(null);
    } finally {
      setIsBusy(false);
    }
  };

  const confirm = async () => {
    if (!serialId.trim() || isBusy) return;
    if (!safeIdPattern.test(serialId.trim())) {
      setError(t(safeIdMessage));
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusMsg(`${t("Đang xác nhận giao hàng cho")} ${effectiveToRole}...`);
    setTxHash(null);
    try {
      const parsed = transferConfirmFormSchema.safeParse({ serialId });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setFieldErrors(errors);
        setError(Object.values(errors)[0] || t("Vui lòng kiểm tra các trường đang báo lỗi."));
        setStatusMsg(null);
        return;
      }

      const data = await confirmTransfer(parsed.data.serialId);
      setTxHash(data.txHash ?? null);
      setTransferId(data.transferId ?? transferId);
      setStatusMsg(t("Xác nhận thành công."));
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Xác nhận thất bại.")));
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
          href="/dashboard/transfers/history"
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
            <Field label={t("Từ")}>
              <select
                className={inputCls}
                value={fromRole}
                disabled={selectableFromRoles.length <= 1}
                onChange={(e) => {
                  setFieldErrors({});
                  if (isInitiatorRole(e.target.value)) setFromRole(e.target.value);
                }}
              >
                {(selectableFromRoles.length ? selectableFromRoles : fromRoleOptions).map((r) => (
                  <option key={r} value={r}>{translateRole(r, language)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("Đến")}>
              <select
                className={inputCls}
                value={effectiveToRole}
                onChange={(e) => {
                  setFieldErrors({});
                  if (isReceiverRole(e.target.value)) setToRole(e.target.value);
                }}
              >
                {toRoleOptions.map((r) => (
                  <option key={r} value={r}>{translateRole(r, language)}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t("Lô có thể chuyển")}</h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {canRoleInitiateTransfer(fromRole)
                    ? `${t("Đang hiển thị hàng do")} ${translateRole(fromRole, language)} ${t("sở hữu và đủ điều kiện chuyển giao.")}`
                    : t("Role hiện tại không có quyền tạo lệnh chuyển.")}
                </p>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                {transferableProducts.length} serial
              </span>
            </div>

            {productsLoading ? (
              <div className="mt-3 space-y-2">
                {[1, 2].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-lg bg-white dark:bg-zinc-950" />
                ))}
              </div>
            ) : inventoryError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <p className="font-semibold">
                  {getApiErrorMessage(inventoryError, t("Không thể tải danh sách lô có thể chuyển."))}
                </p>
                <button
                  type="button"
                  onClick={() => refetchInventory()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 font-bold text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-zinc-950 dark:text-red-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("Làm mới")}
                </button>
              </div>
            ) : batchGroups.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                {t("Không có lô hoặc serial nào thuộc sở hữu role này và sẵn sàng chuyển giao.")}
              </div>
            ) : (
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {batchGroups.map((group) => (
                  <div key={group.batchId} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.productName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{group.batchId}</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{group.manufacturerName}</p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        {group.products.length} serial
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.products.slice(0, 8).map((product) => (
                        <button
                          key={product.serialId}
                          type="button"
                          onClick={() => {
                            setSerialId(product.serialId);
                            setFieldErrors({});
                            setError(null);
                          }}
                          className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                            serialId === product.serialId
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10"
                          }`}
                        >
                          {product.serialId}
                        </button>
                      ))}
                      {group.products.length > 8 ? (
                        <span className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          +{group.products.length - 8}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t("Có thể chuyển đến")}: {toRoleOptions.map((role) => translateRole(role, language)).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label={t("Vị trí (giả lập)")}>
            <input
              className={inputCls}
              value={fromLocation}
              onChange={(e) => setFromLocation(e.target.value)}
              placeholder={t("Ví dụ: Hà Nội – Kho 1")}
            />
          </Field>
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
            <p className="font-semibold text-emerald-800">{t("Mã giao dịch")}</p>
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
            {t("Xác minh")}
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
            href="/dashboard/transfers/history"
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

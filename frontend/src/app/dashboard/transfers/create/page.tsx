"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ArrowRight, CheckCircle2, ExternalLink, ListChecks, RefreshCw, Truck, XCircle } from "lucide-react";
import { bulkScanTransfer, confirmBatchShellTransfer, confirmTransfer, createBatchShellTransfer, getApiErrorMessage, getBatches, getDemoActors, getTransferableProducts, getTransfers, rejectBatchShellTransfer, rejectTransfer, scanTransfer, syncWalletTransferConfirm, syncWalletTransferCreate, syncWalletTransferReject } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { Batch, Product, TransferRecord } from "@/lib/types";
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
import { ActionSpinner } from "@/components/ui/ActionSpinner";

const statusChip: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  RETURNED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const fromRoleOptions = [...transferInitiatorRoles];
type TransferInitiatorRole = (typeof transferInitiatorRoles)[number];
type TransferReceiverRole = (typeof transferReceiverRoles)[number];
const operationalInventoryRoles = ["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "CLINIC", "PHARMACY"] as const;

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";
const safeIdPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const safeIdMessage = "Chỉ dùng chữ, số, dấu chấm, gạch dưới, dấu hai chấm hoặc gạch ngang.";
const batchLikePattern = /^BATCH[-_:]/i;
const batchLikeSerialMessage = "Vui lòng chọn serial sản phẩm bên trong lô, không dùng mã lô để chuyển giao.";

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  ) as Partial<T>;
}

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
    batchId: params.get("batchId") || "",
    autoSelectAllBatch: params.get("autoSelect") === "all",
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

function isBatchLikeSerial(value: string) {
  return batchLikePattern.test(value.trim());
}

function sameId(left?: string, right?: string) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function batchKeysFromBatch(batch?: Batch) {
  return [batch?.id, batch?.batchHash, batch?.batchQR]
    .filter((value): value is string => Boolean(value))
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function batchKeysFromProduct(product?: Product) {
  return [product?.batchId, product?.batchHash]
    .filter((value): value is string => Boolean(value))
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizedKeySet(values: Array<string | undefined>) {
  return new Set(values.filter(Boolean).map((value) => String(value).trim().toLowerCase()));
}

function findBatchForProduct(product: Product, batches: Batch[]) {
  const productKeys = normalizedKeySet(batchKeysFromProduct(product));
  return batches.find((batch) => batchKeysFromBatch(batch).some((key) => productKeys.has(key.toLowerCase())));
}

function groupProductsByBatch(products: Product[], batches: Batch[] = []) {
  const groups = new Map<string, {
    batchId: string;
    productName: string;
    manufacturerName: string;
    products: Product[];
    batch?: Batch;
    keys: string[];
  }>();

  products.forEach((product) => {
    const matchedBatch = findBatchForProduct(product, batches);
    const batchKeys = matchedBatch ? batchKeysFromBatch(matchedBatch) : batchKeysFromProduct(product);
    const batchId = batchKeys[0] || product.batchId || product.batchHash || "UNKNOWN_BATCH";
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
      batch: matchedBatch,
      keys: batchKeys.length > 0 ? batchKeys : [batchId],
    });
  });

  batches.forEach((batch) => {
    const keys = batchKeysFromBatch(batch);
    const batchId = keys[0] || "UNKNOWN_BATCH";
    if (groups.has(batchId)) return;
    groups.set(batchId, {
      batchId,
      productName: batch.productName || "Batch chưa có serial",
      manufacturerName: batch.manufacturerName || "Unknown manufacturer",
      products: [],
      batch,
      keys: keys.length > 0 ? keys : [batchId],
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
  const { address: connectedAddress } = useAccount();
  const { data: allTransfers = [], isLoading } = useQuery<TransferRecord[]>({
    queryKey: ["transfers"],
    queryFn: () => getTransfers({ scope: "mine" }),
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

  const isBatchTransfer = (transfer?: TransferRecord) =>
    Boolean(
      transfer &&
      (transfer.mode === "OFF_CHAIN_BATCH_CUSTODY" ||
        transfer.transferMode === "OFF_CHAIN_BATCH_CUSTODY" ||
        isBatchLikeSerial(transfer.serialId))
    );

  const handleConfirm = async (transfer: TransferRecord) => {
    setBusy(true);
    setError(null);
    try {
      if (isBatchTransfer(transfer)) {
        await confirmBatchShellTransfer(transfer.id);
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["transferable-products"] });
        return;
      }
      const parsed = transferConfirmFormSchema.safeParse({ serialId: transfer.serialId });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setError(Object.values(errors)[0] || tLabel("Serial của lệnh chuyển không hợp lệ."));
        return;
      }

      const shouldUseWallet = storedUser?.authMode === "wallet" && normalizeAddress(storedUser.address) === normalizeAddress(transfer.toAddress);
      if (shouldUseWallet) {
        if (!normalizeAddress(connectedAddress) || normalizeAddress(connectedAddress) !== normalizeAddress(transfer.toAddress)) {
          throw new Error(tLabel("MetaMask đang chọn sai ví. Hãy chuyển sang ví nhận lệnh trước khi xác nhận."));
        }
        if (!publicClient) throw new Error(tLabel("Chưa sẵn sàng kết nối Sepolia."));
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

  const handleConfirmBatchShell = async (transferId: string) => {
    setBusy(true);
    setError(null);
    try {
      await confirmBatchShellTransfer(transferId);
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tLabel("Xác nhận batch thất bại.")));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (transfer: TransferRecord) => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (isBatchTransfer(transfer)) {
        await rejectBatchShellTransfer(transfer.id, rejectReason.trim());
        setRejectingId(null);
        setRejectReason("");
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["transferable-products"] });
        return;
      }
      const parsed = transferRejectFormSchema.safeParse({ serialId: transfer.serialId, rejectionReason: rejectReason });
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setError(Object.values(errors)[0] || tLabel("Vui lòng nhập lý do từ chối hợp lệ."));
        return;
      }

      const shouldUseWallet = storedUser?.authMode === "wallet" && normalizeAddress(storedUser.address) === normalizeAddress(transfer.toAddress);
      if (shouldUseWallet) {
        if (!normalizeAddress(connectedAddress) || normalizeAddress(connectedAddress) !== normalizeAddress(transfer.toAddress)) {
          throw new Error(tLabel("MetaMask đang chọn sai ví. Hãy chuyển sang ví nhận lệnh trước khi từ chối."));
        }
        if (!publicClient) throw new Error(tLabel("Chưa sẵn sàng kết nối Sepolia."));
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

  const handleRejectBatchShell = async (transferId: string) => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rejectBatchShellTransfer(transferId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["transferable-products"] });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tLabel("Từ chối batch thất bại.")));
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
              <p className="font-mono text-xs font-semibold text-zinc-700 truncate">
                {t.mode === "OFF_CHAIN_BATCH_CUSTODY" || t.transferMode === "OFF_CHAIN_BATCH_CUSTODY"
                  ? t.batchId || t.batchHash || tLabel("Batch")
                  : t.serialId}
              </p>
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
                  onClick={() =>
                    isBatchTransfer(t)
                      ? handleRejectBatchShell(t.id)
                      : handleReject(t)
                  }
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
                  disabled={busy || (!isBatchTransfer(t) && !transferConfirmFormSchema.safeParse({ serialId: t.serialId }).success)}
                  onClick={() =>
                    isBatchTransfer(t)
                      ? handleConfirmBatchShell(t.id)
                      : handleConfirm(t)
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> {tLabel("Xác nhận")}
                </button>
                <button
                  disabled={busy || (!isBatchTransfer(t) && !transferRejectFormSchema.safeParse({ serialId: t.serialId, rejectionReason: "valid reason" }).success)}
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
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>(() => initialTransferForm.serialId ? [initialTransferForm.serialId] : []);
  const initialBatchId = initialTransferForm.batchId;
  const [fromRole, setFromRole] = useState<TransferInitiatorRole>(initialTransferForm.fromRole);
  const [toRole, setToRole] = useState<TransferReceiverRole>("DISTRIBUTOR");
  const [selectedBatchShellId, setSelectedBatchShellId] = useState("");
  const [user] = useState<DemoUser | null>(() => (typeof window === "undefined" ? null : getStoredUser()));
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  const selectableFromRoles = useMemo<TransferInitiatorRole[]>(() => {
    if (user?.role === "ADMIN" || user?.role === "RECALL_AUTHORITY") return fromRoleOptions;
    return user?.role && isInitiatorRole(user.role) ? [user.role] : [];
  }, [user]);
  const inventoryRole = user?.role === "ADMIN" || user?.role === "RECALL_AUTHORITY" ? fromRole : user?.role;
  const canLoadInventory = Boolean(
    user && inventoryRole && operationalInventoryRoles.includes(inventoryRole as (typeof operationalInventoryRoles)[number])
  );

  const {
    data: transferableInventory,
    isLoading: productsLoading,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ["transferable-products", user?.address, inventoryRole],
    queryFn: () => getTransferableProducts(inventoryRole),
    enabled: canLoadInventory,
    staleTime: 10_000,
  });
  const { data: ownedBatches = [] } = useQuery<Batch[]>({
    queryKey: ["batches", user?.address, inventoryRole],
    queryFn: () => getBatches({ scope: "mine" }),
    enabled: canLoadInventory,
    staleTime: 10_000,
  });
  const transferableProducts = useMemo(() => transferableInventory?.items || [], [transferableInventory?.items]);
  const canCreateTransfer = Boolean(transferableInventory?.canTransfer);

  const emptyTransferableBatches = useMemo(() => {
    const productBatchKeys = normalizedKeySet(transferableProducts.flatMap((product) => batchKeysFromProduct(product)));
    return ownedBatches.filter((batch) => {
      const keys = batchKeysFromBatch(batch).map((item) => item.toLowerCase());
      return keys.length > 0 && keys.every((key) => !productBatchKeys.has(key)) && !batch.recalledAt && !batch.archivedAt;
    });
  }, [ownedBatches, transferableProducts]);

  const batchGroups = useMemo(() => groupProductsByBatch(transferableProducts, emptyTransferableBatches), [emptyTransferableBatches, transferableProducts]);
  const batchCodeSet = useMemo(() => {
    const codes = new Set<string>();
    batchGroups.forEach((group) => {
      codes.add(group.batchId.toLowerCase());
      group.keys.forEach((key) => codes.add(key.toLowerCase()));
      group.products.forEach((product) => {
        if (product.batchId) codes.add(product.batchId.toLowerCase());
        if (product.batchHash) codes.add(product.batchHash.toLowerCase());
      });
    });
    return codes;
  }, [batchGroups]);
  const isKnownBatchCode = (value: string) => batchCodeSet.has(value.trim().toLowerCase());

  useEffect(() => {
    if (!initialBatchId || !initialTransferForm.autoSelectAllBatch || transferableProducts.length === 0 || selectedSerialIds.length > 0) return;
    const selectedGroup = batchGroups.find((group) =>
      group.keys.some((key) => sameId(key, initialBatchId)) || sameId(group.batchId, initialBatchId)
    );
    const selected = (selectedGroup?.products || transferableProducts.filter((product) =>
      batchKeysFromProduct(product).some((key) => sameId(key, initialBatchId))
    ))
      .map((product) => product.serialId)
      .filter((id) =>
        id &&
        !isBatchLikeSerial(id) &&
        !sameId(id, initialBatchId) &&
        !selectedGroup?.keys.some((key) => sameId(id, key))
      );
    if (selected.length > 0) {
      window.setTimeout(() => {
        setSelectedSerialIds(selected);
        setSerialId(selected[0]);
      }, 0);
    }
  }, [batchGroups, initialBatchId, initialTransferForm.autoSelectAllBatch, selectedSerialIds.length, transferableProducts]);

  const toRoleOptions = useMemo(() => {
    const backendRoles = (transferableInventory?.allowedToRoles || []).filter(isReceiverRole);
    return backendRoles.length > 0 ? backendRoles : allowedTransferRoutes[fromRole] || [];
  }, [fromRole, transferableInventory?.allowedToRoles]);
  const effectiveToRole = toRoleOptions.includes(toRole) ? toRole : toRoleOptions[0] || "DISTRIBUTOR";

  const create = async () => {
    const serialsToTransfer = Array.from(new Set((selectedSerialIds.length ? selectedSerialIds : [serialId]).map((item) => item.trim()).filter(Boolean)));
    const primarySerialId = serialsToTransfer[0] || "";
    if (isBusy) return;
    if (!primarySerialId && !selectedBatchShellId) return;
    if (selectedBatchShellId && serialsToTransfer.length === 0) {
      setIsBusy(true);
      setError(null);
      setStatusMsg(t("Đang tạo lệnh chuyển batch..."));
      setTxHash(null);
      try {
        const data = await createBatchShellTransfer({
          batchId: selectedBatchShellId,
          fromRole,
          toRole: effectiveToRole,
        });
        setTransferId(data.transferId || data.transfer.id);
        setStatusMsg(t("Đã tạo lệnh chuyển batch. Bên nhận có thể xác nhận trong danh sách lệnh."));
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["batches"] });
        qc.invalidateQueries({ queryKey: ["transferable-products"] });
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, t("Tạo lệnh batch thất bại.")));
        setStatusMsg(null);
      } finally {
        setIsBusy(false);
      }
      return;
    }
    if (serialsToTransfer.some((item) => !safeIdPattern.test(item))) {
      setError(t(safeIdMessage));
      return;
    }
    if (serialsToTransfer.some((item) => isBatchLikeSerial(item) || isKnownBatchCode(item) || sameId(item, initialBatchId))) {
      setError(t(batchLikeSerialMessage));
      return;
    }
    const transferPayload = compactPayload({
      serialId: primarySerialId,
      fromRole,
      toRole: effectiveToRole,
      batchId: initialBatchId || undefined,
    });
    setIsBusy(true);
    setError(null);
    setStatusMsg(`${t("Đang tạo lệnh")} ${fromRole} -> ${effectiveToRole} on-chain... (${serialsToTransfer.length} serial)`);
    setTxHash(null);
    try {
      const parsed = transferScanFormSchema.safeParse(transferPayload);
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        setFieldErrors(errors);
        setError(Object.values(errors)[0] || t("Vui lòng kiểm tra các trường đang báo lỗi."));
        setStatusMsg(null);
        return;
      }

      let data: { txHash?: string; transfer?: TransferRecord; transferId?: string };
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
      } else if (serialsToTransfer.length > 1) {
        const bulkPayload = { ...parsed.data };
        delete (bulkPayload as Partial<typeof parsed.data>).serialId;
        const bulk = await bulkScanTransfer({
          ...bulkPayload,
          serialIds: serialsToTransfer,
        });
        const failedText = bulk.failed.length > 0 ? ` ${bulk.failed.length} lỗi.` : "";
        setStatusMsg(`${t("Đã tạo")} ${bulk.successful.length}/${bulk.total} ${t("lệnh chuyển.")}${failedText}`);
        setTransferId(bulk.successful[0]?.transfer?.id ?? null);
        data = bulk.successful[0] || {};
      } else {
        data = await scanTransfer(parsed.data);
      }
      setTxHash(data.txHash ?? null);
      setTransferId(data.transfer?.id ?? transferId);
      if (serialsToTransfer.length === 1) setStatusMsg(t("Đã tạo lệnh. Xác nhận giao hàng ở danh sách bên phải."));
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
    if (isBatchLikeSerial(serialId)) {
      setError(t(batchLikeSerialMessage));
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
                setSelectedSerialIds(e.target.value.trim() ? [e.target.value.trim()] : []);
                setSelectedBatchShellId("");
              }}
              placeholder="VCN-…"
            />
            {selectedSerialIds.length > 1 ? (
              <p className="mt-1 text-xs font-semibold text-blue-600">
                {t("Đã chọn")} {selectedSerialIds.length} serial
              </p>
            ) : null}
          </Field>

          {canCreateTransfer ? (
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
          ) : null}

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {canCreateTransfer ? t("Lô có thể chuyển") : t("Lô đang sở hữu")}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {canCreateTransfer
                    ? `${t("Đang hiển thị hàng do")} ${translateRole(inventoryRole || fromRole, language)} ${t("sở hữu và đủ điều kiện chuyển giao.")}`
                    : `${t("Đang hiển thị hàng do")} ${translateRole(inventoryRole || "", language)} ${t("sở hữu. Đây là điểm nhận cuối nên không thể tạo lệnh chuyển tiếp.")}`}
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
                {batchGroups.map((group) => {
                  const validProducts = group.products.filter((product) =>
                    product.serialId &&
                    !isBatchLikeSerial(product.serialId) &&
                    !sameId(product.serialId, group.batchId) &&
                    !group.keys.some((key) => sameId(product.serialId, key))
                  );

                  return (
                  <div key={group.batchId} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.productName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{group.batchId}</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{group.manufacturerName}</p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        {validProducts.length > 0 ? `${validProducts.length} serial` : t("Batch")}
                      </span>
                    </div>
                    {canCreateTransfer ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {validProducts.length > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const ids = validProducts.map((product) => product.serialId);
                                setSelectedSerialIds((current) => Array.from(new Set([...current, ...ids])));
                                setSerialId(ids[0] || serialId);
                                setSelectedBatchShellId("");
                                setFieldErrors({});
                                setError(null);
                              }}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              {t("Chọn cả lô")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const ids = new Set(validProducts.map((product) => product.serialId));
                                setSelectedSerialIds((current) => current.filter((id) => !ids.has(id)));
                                setFieldErrors({});
                                setError(null);
                              }}
                              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50"
                            >
                              {t("Bỏ chọn lô")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBatchShellId(group.batchId);
                              setSelectedSerialIds([]);
                              setSerialId("");
                              setFieldErrors({});
                              setError(null);
                            }}
                            className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${
                              selectedBatchShellId === group.batchId
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            {selectedBatchShellId === group.batchId ? t("Đã chọn batch") : t("Chuyển batch")}
                          </button>
                        )}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {validProducts.slice(0, 8).map((product) => (
                        <button
                          key={product.serialId}
                          type="button"
                          onClick={() => {
                            setSelectedSerialIds((current) => {
                              const exists = current.includes(product.serialId);
                              const next = exists ? current.filter((id) => id !== product.serialId) : [...current, product.serialId];
                              setSerialId(next[0] || product.serialId);
                              setSelectedBatchShellId("");
                              return next;
                            });
                            setFieldErrors({});
                            setError(null);
                          }}
                          className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                            selectedSerialIds.includes(product.serialId)
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10"
                          }`}
                        >
                          {product.serialId}
                        </button>
                      ))}
                      {validProducts.length > 8 ? (
                        <span className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          +{validProducts.length - 8}
                        </span>
                      ) : null}
                    </div>
                    {canCreateTransfer ? (
                      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {t("Có thể chuyển đến")}: {toRoleOptions.map((role) => translateRole(role, language)).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            )}
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
          {canCreateTransfer ? (
            <button
              disabled={isBusy || !(selectedSerialIds.length || serialId.trim() || selectedBatchShellId)}
              onClick={create}
              className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {isBusy ? <ActionSpinner label={t("Đang xử lý...")} /> : selectedBatchShellId ? t("Tạo lệnh batch") : selectedSerialIds.length > 1 ? `${t("Tạo lệnh")} (${selectedSerialIds.length})` : t("Tạo lệnh")}
            </button>
          ) : null}
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

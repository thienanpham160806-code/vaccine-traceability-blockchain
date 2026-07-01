"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { administerProduct, archiveProducts, getApiErrorMessage, getProductDetail, reregisterProduct, updateProduct } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import type { ProductDetailResponse } from "@/lib/types";
import { ProductStatusBadge, RiskLevelBadge } from "@/components/product/ProductStatusBadge";
import { TransferTimeline } from "@/components/trace/TransferTimeline";
import { DetailSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionSpinner } from "@/components/ui/ActionSpinner";
import { canEditProductMetadata, canInitiateTransfer, canRegisterProducts, isAdminAuthority } from "@/lib/role-access";
import { getZodFieldErrors, productMetadataSchema } from "@/lib/validation";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

interface PageProps {
  params: Promise<{
    serialId: string;
  }>;
}

function formatDate(value?: string | number, lang = "vi") {
  if (!value) return "N/A";

  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN");
}

function getTransactionUrl(txHash?: string) {
  if (!txHash) return null;

  const baseUrl = process.env.NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/tx/${txHash}` : null;
}

function getIpfsUrl(cid?: string) {
  if (!cid) return null;

  const baseUrl = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs";
  return `${baseUrl.replace(/\/$/, "")}/${cid}`;
}

export default function ProductDetailPage({ params }: PageProps) {
  const { serialId } = use(params);
  const { language } = useLanguage();
  const t = useTranslation();
  const decodedSerialId = decodeURIComponent(serialId);
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReregistering, setIsReregistering] = useState(false);
  const [isAdministering, setIsAdministering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({
    productName: "",
    manufacturerName: "",
    expiryDate: "",
    notes: "",
  });

  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true);
        setError(null);
        return getProductDetail(decodedSerialId);
      })
      .then((data) => {
        setDetail(data || null);

        if (data?.product) {
          setEditForm({
            productName: data.product.productName || "",
            manufacturerName: data.product.manufacturerName || "",
            expiryDate: data.product.expiryDate || "",
            notes: data.product.notes || "",
          });
        }
      })
      .catch((err) => {
        const message = getApiErrorMessage(err, t("Không tải được chi tiết sản phẩm."));
        setError(message);
        toast.error(message);
      })
      .finally(() => setIsLoading(false));
  }, [decodedSerialId]);

  const startEditing = () => {
    if (!detail) return;

    setEditForm({
      productName: detail.product.productName || "",
      manufacturerName: detail.product.manufacturerName || "",
      expiryDate: detail.product.expiryDate || "",
      notes: detail.product.notes || "",
    });
    setMessage(null);
    setError(null);
    setFieldErrors({});
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setMessage(null);
    setFieldErrors({});
  };

  const handleReregister = async () => {
    if (!detail || isReregistering) return;
    setIsReregistering(true);
    setError(null);
    setMessage(null);
    try {
      const result = await reregisterProduct(detail.product.serialId);
      setMessage(`${t("Đăng ký lại on-chain")} TX: ${result.txHash}`);
      toast.success(t("Đăng ký lại on-chain"));
      setDetail((current) =>
        current ? { ...current, product: { ...current.product, blockchainTx: result.txHash } } : current
      );
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, t("Không thể đăng ký lại on-chain."));
      setError(msg);
      toast.error(msg);
    } finally {
      setIsReregistering(false);
    }
  };

  const saveMetadata = async () => {
    if (!detail || isSaving) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const parsed = productMetadataSchema.safeParse(editForm);
      if (!parsed.success) {
        const errors = getZodFieldErrors(parsed.error);
        const validationMessage = Object.values(errors)[0] || "Please fix the highlighted fields.";
        setFieldErrors(errors);
        setError(validationMessage);
        toast.error(validationMessage);
        return;
      }

      const result = await updateProduct(detail.product.serialId, {
        productName: parsed.data.productName,
        manufacturerName: parsed.data.manufacturerName,
        expiryDate: parsed.data.expiryDate,
        notes: parsed.data.notes,
      });

      if (result?.product) {
        setDetail((current) => {
          if (!current) return current;

          return {
            ...current,
            product: result.product,
            batch: current.batch
              ? {
                  ...current.batch,
                  productName: result.product.productName,
                  manufacturerName: result.product.manufacturerName,
                  expiryDate: result.product.expiryDate,
                  updatedAt: result.product.updatedAt,
                }
              : current.batch,
          };
        });
      }

      setIsEditing(false);
      setMessage(t("Đã cập nhật metadata sản phẩm."));
      setFieldErrors({});
      toast.success(t("Đã cập nhật metadata sản phẩm."));
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, t("Không thể cập nhật metadata sản phẩm."));
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error && !detail) {
    return <ErrorState href="/dashboard/products" actionLabel={t("Quay lại danh sách")} message={error} title={t("Không tải được chi tiết sản phẩm.")} />;
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground">{t("Không tìm thấy chi tiết sản phẩm.")}</p>;
  }

  const { product, batch, blockchain, timeline, riskFlags, recall } = detail;
  const publicUrl = `${process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || "http://localhost:3000/consumer/verify"}/${encodeURIComponent(product.serialId)}`;
  const txHash = blockchain.txHash || product.blockchainTx;
  const txUrl = getTransactionUrl(txHash);
  const ipfsCid = batch?.ipfsCid || product.ipfsCid;
  const ipfsUrl = getIpfsUrl(ipfsCid);
  const currentUser = getStoredUser();
  const canReregisterRole = canRegisterProducts(currentUser);
  const canReregisterOnChain = !blockchain.available && canReregisterRole;
  const hasSyncMismatch = ["OWNER_MISMATCH", "STATUS_MISMATCH", "STALE_PENDING"].includes(product.syncStatus || "");
  const canTransfer =
    canInitiateTransfer(currentUser) &&
    !hasSyncMismatch &&
    !product.archivedAt &&
    !/^BATCH[-_:]/i.test(product.serialId) &&
    !["ARCHIVED", "INVALID", "RECALLED", "ADMINISTERED"].includes(product.status);
  const canEdit = canEditProductMetadata(currentUser);
  const canArchive = isAdminAuthority(currentUser);
  const canAdminister =
    Boolean(currentUser) &&
    !product.archivedAt &&
    !["ARCHIVED", "INVALID", "RECALLED", "ADMINISTERED"].includes(product.status) &&
    (isAdminAuthority(currentUser) ||
      currentUser?.role === "CLINIC" ||
      currentUser?.role === "PHARMACY" ||
      product.ownerRole === "CLINIC" ||
      product.ownerRole === "PHARMACY");

  const archiveSerial = async () => {
    const reason = window.prompt("Nhập lý do ẩn serial khỏi web. Dữ liệu on-chain sẽ không bị xóa.", product.syncStatus || "");
    if (reason === null) return;
    if (!window.confirm("Xác nhận ẩn serial này khỏi web? Blockchain không bị thay đổi.")) return;

    try {
      await archiveProducts({ serialIds: [product.serialId], reason: reason.trim(), mode: "INVALIDATE" });
      toast.success(t("Đã ẩn serial khỏi web."));
      window.location.href = "/dashboard/products";
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, t("Không thể ẩn serial."));
      setError(msg);
      toast.error(msg);
    }
  };

  const markAdministered = async () => {
    if (isAdministering) return;
    const reason = window.prompt("Nhập ghi chú xác nhận đã tiêm. QR/serial này sẽ bị khóa dùng lại trên web.", "");
    if (reason === null) return;
    if (!window.confirm("Xác nhận đánh dấu serial này là đã tiêm? Thao tác này chỉ cập nhật Firebase/audit, không thay đổi on-chain.")) return;

    setIsAdministering(true);
    setError(null);
    setMessage(null);
    try {
      const result = await administerProduct(product.serialId, { reason: reason.trim() });
      setDetail((current) =>
        current && result.product ? { ...current, product: result.product } : current
      );
      setMessage(t("Đã đánh dấu serial là đã tiêm. QR này không nên được dùng lại."));
      toast.success(t("Đã đánh dấu serial là đã tiêm."));
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, t("Không thể đánh dấu đã tiêm."));
      setError(msg);
      toast.error(msg);
    } finally {
      setIsAdministering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t("Chi tiết sản phẩm")}</p>
          <h1 className="break-all text-3xl font-bold">{product.serialId}</h1>
          {hasSyncMismatch ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              {language === "en"
                ? `Firebase and on-chain are out of sync (${product.syncStatus}). Reconcile before transferring.`
                : `Firebase và on-chain đang lệch (${product.syncStatus}). Reconcile trước khi chuyển giao.`}
            </p>
          ) : null}
          {product.status === "ADMINISTERED" ? (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              {t("Serial này đã được xác nhận là đã tiêm. QR không còn hợp lệ để gắn lên sản phẩm khác.")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canReregisterOnChain && (
            <button
              type="button"
              disabled={isReregistering}
              onClick={handleReregister}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isReregistering ? <ActionSpinner label={t("Đang xử lý...")} /> : t("Đăng ký lại on-chain")}
            </button>
          )}
          {canTransfer ? (
            <Link
              href={`/dashboard/transfers/create?serialId=${encodeURIComponent(product.serialId)}`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t("Chuyển giao")}
            </Link>
          ) : null}
          <Link
            href={`/consumer/verify/${encodeURIComponent(product.serialId)}`}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            {t("Xác minh")}
          </Link>
          {canEdit ? (
            <button
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
              onClick={startEditing}
              type="button"
            >
              {t("Sửa metadata")}
            </button>
          ) : null}
          {canAdminister ? (
            <button
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
              disabled={isAdministering}
              onClick={markAdministered}
              type="button"
            >
              {isAdministering ? <ActionSpinner label={t("Đang xử lý...")} /> : t("Đánh dấu đã tiêm")}
            </button>
          ) : null}
          {canArchive ? (
            <button
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
              onClick={archiveSerial}
              type="button"
            >
              {t("Ẩn khỏi web")}
            </button>
          ) : null}
          <Link
            href="/dashboard/products"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            {t("Quay lại")}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
            <div>
              <h2 className="text-xl font-bold">{product.productName}</h2>
              <p className="text-sm text-muted-foreground">{product.manufacturerName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ProductStatusBadge status={product.status} />
              <RiskLevelBadge riskLevel={product.riskLevel} />
            </div>
          </div>

          {message ? (
            <p className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="font-semibold text-gray-700">Batch ID</p>
              <p className="break-all text-muted-foreground">{product.batchId}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Batch Hash</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{product.batchHash || "N/A"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Current Owner</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{product.currentOwner}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Owner Role</p>
              <p className="text-muted-foreground">{product.ownerRole || "N/A"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">{t("Vị trí hiện tại")}</p>
              <p className="text-muted-foreground">{product.currentWarehouseName || product.currentLocationName || "N/A"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Sync Status</p>
              <p className={hasSyncMismatch ? "font-semibold text-amber-700" : "text-muted-foreground"}>{product.syncStatus || "OK"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">{t("Địa chỉ nhà sản xuất")}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{product.manufacturerAddress || "N/A"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">{t("Ngày hết hạn")}</p>
              <p className="text-muted-foreground">{formatDate(product.expiryDate, language)}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Origin</p>
              <p className="text-muted-foreground">{batch?.origin || (product.isImported ? "IMPORTED" : "MANUFACTURED")}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">ZKP Verified</p>
              <p className="text-muted-foreground">{product.zkpVerified ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">{t("Ngày đăng ký")}</p>
              <p className="text-muted-foreground">{formatDate(product.registeredAt || product.createdAt, language)}</p>
            </div>
          </div>

          {product.notes ? (
            <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-gray-700">{t("Ghi chú")}</p>
              <p className="mt-1 text-muted-foreground">{product.notes}</p>
            </div>
          ) : null}

          {isEditing ? (
            <div className="mt-5 space-y-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              {Object.keys(fieldErrors).length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  <p>{t("Vui lòng kiểm tra các trường sau:")}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {Object.entries(fieldErrors).map(([field, validationMessage]) => (
                      <li key={field}>
                        {field}: {validationMessage}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">{t("Tên sản phẩm")}</label>
                  <input
                    className="w-full rounded-md border border-zinc-200 bg-white p-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={editForm.productName}
                    onChange={(event) => {
                      setFieldErrors({});
                      setEditForm({ ...editForm, productName: event.target.value });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">{t("Nhà sản xuất")}</label>
                  <input
                    className="w-full rounded-md border border-zinc-200 bg-white p-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={editForm.manufacturerName}
                    onChange={(event) => {
                      setFieldErrors({});
                      setEditForm({ ...editForm, manufacturerName: event.target.value });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">{t("Ngày hết hạn")}</label>
                  <input
                    className="w-full rounded-md border border-zinc-200 bg-white p-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    type="date"
                    value={editForm.expiryDate}
                    onChange={(event) => {
                      setFieldErrors({});
                      setEditForm({ ...editForm, expiryDate: event.target.value });
                    }}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-semibold text-gray-700">{t("Ghi chú")}</label>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-zinc-200 bg-white p-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={editForm.notes}
                    onChange={(event) => {
                      setFieldErrors({});
                      setEditForm({ ...editForm, notes: event.target.value });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                  disabled={isSaving || !editForm.productName.trim() || !editForm.manufacturerName.trim() || !editForm.expiryDate}
                  onClick={saveMetadata}
                  type="button"
                >
                  {isSaving ? t("Đang lưu...") : t("Lưu metadata")}
                </button>
                <button
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  disabled={isSaving}
                  onClick={cancelEditing}
                  type="button"
                >
                  {t("Hủy")}
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("Các trường có thể sửa được lưu off-chain trong Firebase. Serial, chủ sở hữu, trạng thái, rủi ro và giao dịch blockchain là chỉ đọc.")}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t("QR cho người dùng")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Link xác minh công khai cho serial này.")}</p>
          <div className="qr-surface mt-5 flex justify-center rounded-xl border p-5">
            <QRCodeSVG value={publicUrl} size={180} level="H" includeMargin bgColor="#ffffff" fgColor="#000000" />
          </div>
          <p className="mt-4 break-all font-mono text-xs text-muted-foreground">{publicUrl}</p>
          <Link
            href={`/consumer/verify/${encodeURIComponent(product.serialId)}`}
            className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("Mở trang công khai")}
          </Link>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Blockchain</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="font-semibold text-gray-700">Serial Hash</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{blockchain.serialHash}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Transaction</p>
              {txHash ? (
                txUrl ? (
                  <a
                    className="break-all font-mono text-xs text-blue-600 hover:underline"
                    href={txUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {txHash}
                  </a>
                ) : (
                  <p className="break-all font-mono text-xs text-muted-foreground">{txHash}</p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">N/A</p>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-semibold text-gray-700">{t("Trạng thái trên chain")}</p>
                <p className="text-muted-foreground">{blockchain.status}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700">{t("Kết nối chain")}</p>
                <p className="text-muted-foreground">{blockchain.available ? (language === "en" ? "Yes" : "Có") : (language === "en" ? "No" : "Không")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t("Lô hàng & thu hồi")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              <span className="font-semibold text-gray-700">Batch Product:</span>{" "}
              <span className="text-muted-foreground">{batch?.productName || product.productName}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-700">{t("Số lượng:")}</span>{" "}
              <span className="text-muted-foreground">{batch?.quantity ?? "N/A"}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-700">IPFS CID:</span>{" "}
              {ipfsCid ? (
                <a
                  className="break-all font-mono text-xs text-blue-600 hover:underline"
                  href={ipfsUrl || undefined}
                  rel="noreferrer"
                  target="_blank"
                >
                  {ipfsCid}
                </a>
              ) : (
                <span className="text-muted-foreground">N/A</span>
              )}
            </p>
            <p>
              <span className="font-semibold text-gray-700">{t("Thu hồi:")}</span>{" "}
              <span className={recall || batch?.recalledAt ? "font-semibold text-red-700" : "text-muted-foreground"}>
                {recall || batch?.recalledAt ? t("Đã thu hồi") : t("Chưa thu hồi")}
              </span>
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{t("Lịch sử chuyển giao")}</h2>
        <div className="mt-4">
          <TransferTimeline
            events={timeline}
            currentOwner={product.currentOwner}
            language={language}
            emptyText={t("Chưa có lịch sử chuyển giao.")}
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{t("Lịch sử rủi ro")}</h2>
        <div className="mt-4 space-y-3">
          {riskFlags.map((flag, index) => (
            <div key={flag.id || flag.serialId || index} className="rounded-lg border border-zinc-200 p-4 text-sm">
              <p className="font-semibold">{flag.reason || flag.flagReason || t("Cảnh báo rủi ro")}</p>
              <p className="text-muted-foreground">{t("Mức")} {String(flag.level || flag.riskLevel || "N/A")}</p>
            </div>
          ))}
          {riskFlags.length === 0 ? <p className="text-sm text-muted-foreground">{t("Sản phẩm này chưa có cảnh báo rủi ro.")}</p> : null}
        </div>
      </section>
    </div>
  );
}


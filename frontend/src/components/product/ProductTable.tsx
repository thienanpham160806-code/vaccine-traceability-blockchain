"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { archiveProducts, getApiErrorMessage, getProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { TableSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { getProductStatusLabel } from "@/lib/status";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { getStoredUser } from "@/lib/auth";
import { canInitiateTransfer, canViewAllScope, isAdminAuthority } from "@/lib/role-access";

const statusOptions = ["ALL", "REGISTERED", "VERIFIED", "IN_TRANSIT", "PENDING_DELIVERY", "DELIVERED", "FLAGGED", "RECALLED"];
const originOptions = ["ALL", "MANUFACTURED", "IMPORTED"];
const sortableColumns = ["batchId", "productName", "manufacturerName", "status", "expiryDate", "createdAt"];
const batchLikePattern = /^BATCH[-_:]/i;

export function ProductTable() {
  const t = useTranslation();
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("ALL");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const canToggleAll = canViewAllScope(user);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const showTransferAction = canInitiateTransfer(user);
  const canArchive = isAdminAuthority(user);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      getProducts({
        search: search.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        manufacturer: manufacturerFilter.trim() || undefined,
        scope,
        batch: batchFilter.trim() || undefined,
        origin: originFilter === "ALL" ? undefined : (originFilter as "MANUFACTURED" | "IMPORTED"),
        sort,
        page,
        pageSize,
      })
        .then((data) => {
          setProducts(data.items);
          setTotal(data.total);
        })
        .catch((err) => {
          const message = err?.response?.data?.error?.message || t("Không tải được danh sách sản phẩm.");
          setError(message);
          toast.error(message);
          setProducts([]);
          setTotal(0);
        })
        .finally(() => setIsLoading(false));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [batchFilter, manufacturerFilter, originFilter, page, pageSize, reloadKey, scope, search, sort, statusFilter, t]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const toggleColumnSort = (field: string) => {
    if (!sortableColumns.includes(field)) return;
    const [currentField, currentDirection] = sort.split(":");
    setSort(`${field}:${currentField === field && currentDirection === "asc" ? "desc" : "asc"}`);
    setPage(1);
  };

  const sortMark = (field: string) => {
    const [currentField, currentDirection] = sort.split(":");
    return currentField === field ? (currentDirection === "asc" ? " ↑" : " ↓") : "";
  };

  const shortAddress = (address?: string) =>
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "-";
  const canTransferProduct = (product: Product) =>
    showTransferAction &&
    scope === "mine" &&
    !product.archivedAt &&
    !batchLikePattern.test(product.serialId) &&
    product.syncStatus !== "OWNER_MISMATCH" &&
    product.syncStatus !== "STATUS_MISMATCH" &&
    product.syncStatus !== "STALE_PENDING" &&
    !["ARCHIVED", "INVALID", "RECALLED", "ADMINISTERED"].includes(product.status) &&
    ["REGISTERED", "VERIFIED", "DELIVERED", "DELIVERED_TO_DISTRIBUTOR", "DELIVERED_TO_CLINIC", "DELIVERED_TO_PHARMACY"].includes(product.status);

  const archiveSerial = async (product: Product) => {
    const reason = window.prompt(t("Nhập lý do ẩn serial khỏi web. Dữ liệu on-chain sẽ không bị xóa."), product.syncStatus || "");
    if (reason === null) return;
    if (!window.confirm(t("Xác nhận ẩn serial này khỏi web? Blockchain không bị thay đổi."))) return;

    try {
      await archiveProducts({ serialIds: [product.serialId], reason: reason.trim(), mode: "INVALIDATE" });
      toast.success(t("Đã ẩn serial khỏi web."));
      setReloadKey((current) => current + 1);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t("Không thể ẩn serial.")));
    }
  };

  return (
    <div className="space-y-4">
      {canToggleAll ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm dark:border-blue-500/20 dark:bg-blue-500/10">
          <span className="font-semibold text-blue-800 dark:text-blue-100">{t("Phạm vi hiển thị")}</span>
          <div className="flex rounded-lg border border-blue-200 bg-white p-1 dark:border-blue-500/30 dark:bg-zinc-950">
            {(["mine", "all"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setScope(option);
                  setPage(1);
                }}
                className={`min-h-8 rounded-md px-3 text-xs font-bold ${scope === option ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-500/10"}`}
              >
                {option === "mine" ? t("Của tôi") : t("Toàn hệ thống")}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-semibold text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {t("Đang hiển thị dữ liệu liên quan tới role hiện tại.")}
        </div>
      )}
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none md:grid-cols-2 xl:grid-cols-[1.2fr_170px_170px_170px_170px]">
        <input
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={search}
          onChange={(event) => resetPage(() => setSearch(event.target.value))}
          placeholder={t("Tìm serial, lô, sản phẩm")}
        />
        <input
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={batchFilter}
          onChange={(event) => resetPage(() => setBatchFilter(event.target.value))}
          placeholder={t("Lọc theo lô")}
        />
        <input
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={manufacturerFilter}
          onChange={(event) => resetPage(() => setManufacturerFilter(event.target.value))}
          placeholder={t("Lọc nhà sản xuất")}
        />
        <select
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={statusFilter}
          onChange={(event) => resetPage(() => setStatusFilter(event.target.value))}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status === "ALL" ? t("Tất cả trạng thái") : getProductStatusLabel(status, language)}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={originFilter}
          onChange={(event) => resetPage(() => setOriginFilter(event.target.value))}
        >
          {originOptions.map((origin) => (
            <option key={origin} value={origin}>
              {origin === "ALL" ? t("Tất cả nguồn gốc") : origin === "IMPORTED" ? t("Nhập khẩu") : t("Sản xuất trong nước")}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        {isLoading ? <TableSkeleton columns={6} rows={pageSize} /> : null}
        {!isLoading && error ? (
          <div className="p-4">
            <ErrorState message={error} onAction={() => setReloadKey((current) => current + 1)} />
          </div>
        ) : null}
        {!isLoading && !error ? (
          <>
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto p-3 md:hidden">
            {products.map((product) => (
              <article key={product.serialId} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">{product.serialId}</p>
                    <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{product.productName}</p>
                  </div>
                  <ProductStatusBadge status={product.status} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <p><span className="font-semibold">{t("Mã lô")}:</span> {product.batchId}</p>
                  <p><span className="font-semibold">{t("Nhà sản xuất")}:</span> {product.manufacturerName}</p>
                  <p><span className="font-semibold">{t("Chủ sở hữu")}:</span> {product.ownerRole || "-"} · {shortAddress(product.currentOwner)}</p>
                  <p><span className="font-semibold">{t("Vị trí")}:</span> {product.currentWarehouseName || product.currentLocationName || "-"}</p>
                  <p><span className="font-semibold">Sync:</span> {product.syncStatus || "OK"}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link href={`/dashboard/products/${encodeURIComponent(product.serialId)}`} className="font-semibold text-blue-600 hover:underline">{t("Chi tiết")}</Link>
                  {canTransferProduct(product) ? (
                    <Link href={`/dashboard/transfers/create?serialId=${encodeURIComponent(product.serialId)}`} className="font-semibold text-emerald-600 hover:underline">{t("Chuyển giao")}</Link>
                  ) : null}
                  {canArchive ? (
                    <button type="button" onClick={() => archiveSerial(product)} className="font-semibold text-red-600 hover:underline">{t("Ẩn khỏi web")}</button>
                  ) : null}
                  <Link href={`/consumer/verify/${encodeURIComponent(product.serialId)}`} className="font-semibold text-zinc-600 hover:underline dark:text-zinc-300">{t("Công khai")}</Link>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden max-h-[520px] overflow-auto md:block lg:max-h-[calc(100dvh-25rem)]">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-4">Serial ID</th>
                  <th className="px-5 py-4"><button type="button" onClick={() => toggleColumnSort("batchId")}>{t("Mã lô")}{sortMark("batchId")}</button></th>
                  <th className="px-5 py-4"><button type="button" onClick={() => toggleColumnSort("productName")}>{t("Sản phẩm")}{sortMark("productName")}</button></th>
                  <th className="px-5 py-4"><button type="button" onClick={() => toggleColumnSort("manufacturerName")}>{t("Nhà sản xuất")}{sortMark("manufacturerName")}</button></th>
                  <th className="px-5 py-4"><button type="button" onClick={() => toggleColumnSort("status")}>{t("Trạng thái")}{sortMark("status")}</button></th>
                  <th className="px-5 py-4">{t("Chủ sở hữu")}</th>
                  <th className="px-5 py-4">{t("Vị trí")}</th>
                  <th className="px-5 py-4">Sync</th>
                  <th className="px-5 py-4">{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.map((product) => (
                  <tr key={product.serialId} className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <td className="px-5 py-4 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">{product.serialId}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-300">{product.batchId}</td>
                    <td className="px-5 py-4 font-medium text-zinc-900 dark:text-zinc-100">{product.productName}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-300">{product.manufacturerName}</td>
                    <td className="px-5 py-4"><ProductStatusBadge status={product.status} /></td>
                    <td className="px-5 py-4 text-xs text-zinc-500 dark:text-zinc-300">
                      <p className="font-semibold">{product.ownerRole || "-"}</p>
                      <p className="font-mono">{shortAddress(product.currentOwner)}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-500 dark:text-zinc-300">{product.currentWarehouseName || product.currentLocationName || "-"}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-zinc-500 dark:text-zinc-300">{product.syncStatus || "OK"}</td>
                    <td className="flex flex-wrap gap-3 px-5 py-4">
                      <Link href={`/dashboard/products/${encodeURIComponent(product.serialId)}`} className="font-medium text-blue-600 hover:underline">{t("Chi tiết")}</Link>
                      {canTransferProduct(product) ? (
                        <Link href={`/dashboard/transfers/create?serialId=${encodeURIComponent(product.serialId)}`} className="font-medium text-emerald-600 hover:underline">{t("Chuyển giao")}</Link>
                      ) : null}
                      {canArchive ? (
                        <button type="button" onClick={() => archiveSerial(product)} className="font-medium text-red-600 hover:underline">{t("Ẩn")}</button>
                      ) : null}
                      <Link href={`/consumer/verify/${encodeURIComponent(product.serialId)}`} className="font-medium text-zinc-600 hover:underline dark:text-zinc-300">{t("Công khai")}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : null}
        {!isLoading && !error && products.length === 0 ? <p className="p-4 text-sm text-gray-500 dark:text-zinc-400">{t("Không tìm thấy sản phẩm.")}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-gray-500 dark:text-zinc-400">{t("Đang hiển thị")} {products.length} / {total} {t("sản phẩm")}</p>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("Trước")}</button>
          <span className="min-w-24 text-center text-gray-600 dark:text-zinc-400">{t("Trang")} {page} / {totalPages}</span>
          <button className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200" disabled={page >= totalPages || isLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{t("Sau")}</button>
        </div>
      </div>
    </div>
  );
}

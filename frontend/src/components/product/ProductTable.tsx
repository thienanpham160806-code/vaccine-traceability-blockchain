"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { TableSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { getProductStatusLabel } from "@/lib/status";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const statusOptions = [
  "ALL",
  "VERIFIED",
  "PENDING_DELIVERY",
  "DELIVERED",
  "FLAGGED",
  "RECALLED",
];

const sortOptions = [
  { value: "createdAt:desc", label: "Mới nhất" },
  { value: "createdAt:asc", label: "Cũ nhất" },
  { value: "expiryDate:asc", label: "Gần hết hạn" },
  { value: "productName:asc", label: "Tên A-Z" },
  { value: "status:asc", label: "Trạng thái" },
];

export function ProductTable() {
  const t = useTranslation();
  const { language } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      getProducts({
        search: search.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
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
  }, [page, pageSize, reloadKey, search, sort, statusFilter, t]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const updateStatus = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const updateSort = (value: string) => {
    setSort(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px]">
        <input
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder={t("Tìm serial, lô hàng, sản phẩm, nhà sản xuất")}
        />

        <select
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          value={statusFilter}
          onChange={(event) => updateStatus(event.target.value)}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status === "ALL" ? t("Tất cả trạng thái") : getProductStatusLabel(status, language)}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          value={sort}
          onChange={(event) => updateSort(event.target.value)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {isLoading ? <TableSkeleton columns={6} rows={pageSize} /> : null}
        {!isLoading && error ? (
          <div className="p-4">
            <ErrorState message={error} onAction={() => setReloadKey((current) => current + 1)} />
          </div>
        ) : null}

        {!isLoading && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Serial ID</th>
                  <th className="px-5 py-4">{t("Mã lô")}</th>
                  <th className="px-5 py-4">{t("Sản phẩm")}</th>
                  <th className="px-5 py-4">{t("Nhà sản xuất")}</th>
                  <th className="px-5 py-4">{t("Trạng thái")}</th>
                  <th className="px-5 py-4">{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {products.map((product) => (
                  <tr key={product.serialId} className="transition hover:bg-zinc-50">
                    <td className="px-5 py-4 font-mono text-xs font-bold text-zinc-900">{product.serialId}</td>
                    <td className="px-5 py-4 text-zinc-500">{product.batchId}</td>
                    <td className="px-5 py-4 font-medium text-zinc-900">{product.productName}</td>
                    <td className="px-5 py-4 text-zinc-500">{product.manufacturerName}</td>
                    <td className="px-5 py-4">
                      <ProductStatusBadge status={product.status} />
                    </td>
                    <td className="flex flex-wrap gap-3 px-5 py-4">
                      <Link href={`/dashboard/products/${encodeURIComponent(product.serialId)}`} className="font-medium text-blue-600 hover:underline">
                        {t("Chi tiết")}
                      </Link>
                      <Link href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(product.serialId)}`} className="font-medium text-emerald-600 hover:underline">
                        {t("Chuyển giao")}
                      </Link>
                      <Link href={`/consumer/verify/${product.serialId}`} className="font-medium text-zinc-600 hover:underline">
                        {t("Công khai")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!isLoading && !error && products.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">{t("Không tìm thấy sản phẩm.")}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-gray-500">
          {t("Đang hiển thị")} {products.length} / {total} {t("Sản phẩm").toLowerCase()}
        </p>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("Trước")}
          </button>
          <span className="min-w-24 text-center text-gray-600">
            {t("Trang")} {page} / {totalPages}
          </span>
          <button
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            {t("Sau")}
          </button>
        </div>
      </div>
    </div>
  );
}

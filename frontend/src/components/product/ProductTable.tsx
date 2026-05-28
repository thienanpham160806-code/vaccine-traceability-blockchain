"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { TableSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";

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
          const message = err?.response?.data?.error?.message || "Không tải được danh sách sản phẩm.";
          setError(message);
          toast.error(message);
          setProducts([]);
          setTotal(0);
        })
        .finally(() => setIsLoading(false));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [page, pageSize, reloadKey, search, sort, statusFilter]);

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
      <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px]">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="Tìm serial, lô hàng, sản phẩm, nhà sản xuất"
        />

        <select
          className="rounded-md border bg-white px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => updateStatus(event.target.value)}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status === "ALL" ? "Tất cả trạng thái" : status}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border bg-white px-3 py-2 text-sm"
          value={sort}
          onChange={(event) => updateSort(event.target.value)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {isLoading ? <TableSkeleton columns={6} rows={pageSize} /> : null}
        {!isLoading && error ? (
          <div className="p-4">
            <ErrorState message={error} onAction={() => setReloadKey((current) => current + 1)} />
          </div>
        ) : null}

        {!isLoading && !error ? <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 font-bold">
            <tr>
              <th className="p-4">Serial ID</th>
              <th className="p-4">Mã lô</th>
              <th className="p-4">Sản phẩm</th>
              <th className="p-4">Nhà sản xuất</th>
              <th className="p-4">Trạng thái</th>
              <th className="p-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.serialId} className="border-b transition hover:bg-gray-50">
                <td className="p-4 font-mono font-bold text-gray-900">{product.serialId}</td>
                <td className="p-4 text-gray-500">{product.batchId}</td>
                <td className="p-4">{product.productName}</td>
                <td className="p-4 text-gray-500">{product.manufacturerName}</td>
                <td className="p-4">
                  <ProductStatusBadge status={product.status} />
                </td>
                <td className="flex flex-wrap gap-3 p-4">
                  <Link href={`/dashboard/products/${encodeURIComponent(product.serialId)}`} className="font-medium text-blue-600 hover:underline">
                    Chi tiết
                  </Link>
                  <Link href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(product.serialId)}`} className="font-medium text-emerald-600 hover:underline">
                    Chuyển giao
                  </Link>
                  <Link href={`/consumer/verify/${product.serialId}`} className="font-medium text-zinc-600 hover:underline">
                    Công khai
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table> : null}

        {!isLoading && !error && products.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Không tìm thấy sản phẩm.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-gray-500">
          Đang hiển thị {products.length} / {total} sản phẩm
        </p>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md border px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Trước
          </button>
          <span className="min-w-24 text-center text-gray-600">
            Trang {page} / {totalPages}
          </span>
          <button
            className="rounded-md border px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}

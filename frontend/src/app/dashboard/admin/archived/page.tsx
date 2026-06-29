"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ExternalLink, RefreshCw } from "lucide-react";
import { getArchivedData, type ArchivedDataResponse } from "@/lib/api";

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString("vi-VN") : "-";
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-12 text-center text-sm text-zinc-500">
      Chưa có dữ liệu nào bị ẩn khỏi web.
    </div>
  );
}

export default function ArchivedDataPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ArchivedDataResponse>({
    queryKey: ["admin-archived-data"],
    queryFn: getArchivedData,
  });

  const products = data?.products || [];
  const batches = data?.batches || [];

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-500">Admin cleanup</p>
          <h1 className="text-3xl font-bold text-zinc-950">Dữ liệu đã ẩn</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Các mục ở đây chỉ bị ẩn mềm khỏi web/Firebase view. Dữ liệu on-chain không bị xóa hay chỉnh sửa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-archived-data"] })}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-zinc-100" />)}
        </div>
      ) : products.length === 0 && batches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
              <Archive className="h-4 w-4 text-blue-600" />
              <h2 className="font-bold text-zinc-900">Serial đã ẩn ({products.length})</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {products.length === 0 ? (
                <p className="p-5 text-sm text-zinc-400">Chưa có serial nào bị ẩn.</p>
              ) : products.map((item) => (
                <article key={item.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-bold text-zinc-900">{item.serialId || item.product?.serialId || item.id}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{item.product?.productName || "Không có metadata sản phẩm"}</p>
                    </div>
                    <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                      {item.mode || item.product?.status || "ARCHIVE"}
                    </span>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <p><span className="font-bold text-zinc-500">Lý do:</span> {item.reason || item.product?.archiveReason || "-"}</p>
                    <p><span className="font-bold text-zinc-500">Người thao tác:</span> <span className="font-mono">{item.actor || item.product?.archivedBy || "-"}</span></p>
                    <p><span className="font-bold text-zinc-500">Thời gian:</span> {formatTime(item.createdAt || item.product?.archivedAt)}</p>
                    <p><span className="font-bold text-zinc-500">Batch:</span> <span className="font-mono">{item.product?.batchId || item.product?.batchHash || "-"}</span></p>
                  </div>
                  {(item.serialId || item.product?.serialId) ? (
                    <Link
                      href={`/dashboard/products/${encodeURIComponent(item.serialId || item.product?.serialId || "")}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Mở chi tiết
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
              <Archive className="h-4 w-4 text-amber-600" />
              <h2 className="font-bold text-zinc-900">Batch đã ẩn ({batches.length})</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {batches.length === 0 ? (
                <p className="p-5 text-sm text-zinc-400">Chưa có batch nào bị ẩn.</p>
              ) : batches.map((item) => (
                <article key={item.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-bold text-zinc-900">{item.batchId || item.batch?.id || item.id}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{item.batch?.productName || "Không có metadata lô"}</p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                      {item.serialsAffected ?? 0} serial
                    </span>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <p><span className="font-bold text-zinc-500">Lý do:</span> {item.reason || item.batch?.archiveReason || "-"}</p>
                    <p><span className="font-bold text-zinc-500">Người thao tác:</span> <span className="font-mono">{item.actor || item.batch?.archivedBy || "-"}</span></p>
                    <p><span className="font-bold text-zinc-500">Thời gian:</span> {formatTime(item.createdAt || item.batch?.archivedAt)}</p>
                    <p><span className="font-bold text-zinc-500">Hash:</span> <span className="font-mono">{item.batch?.batchHash || item.id}</span></p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

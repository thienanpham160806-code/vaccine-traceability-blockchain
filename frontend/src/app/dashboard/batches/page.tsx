"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Boxes, RefreshCw } from "lucide-react";
import { ProductForm } from "@/components/product/ProductForm";
import { getBatches } from "@/lib/api";
import type { Batch } from "@/lib/types";

function BatchRow({ batch }: { batch: Batch }) {
  const isRecalled = !!batch.recalledAt;
  return (
    <Link
      href={`/dashboard/batches/${encodeURIComponent(batch.id || batch.batchHash)}`}
      className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-zinc-800 truncate">{batch.productName}</p>
          {isRecalled ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
              THU HỒI
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {batch.origin}
            </span>
          )}
        </div>
        <p className="font-mono text-xs text-zinc-400 truncate">{batch.batchQR || batch.id}</p>
        <div className="mt-1.5 flex gap-4 text-xs text-zinc-400">
          <span>SL: {batch.quantity}</span>
          <span>HSD: {batch.expiryDate}</span>
          <span>{batch.manufacturerName}</span>
        </div>
      </div>
      <ArrowRight className="ml-4 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-blue-500" />
    </Link>
  );
}

export default function BatchManagementPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(true);

  const { data: batches = [], isLoading } = useQuery<Batch[]>({
    queryKey: ["batches"],
    queryFn: getBatches,
  });

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["batches"] });
  };

  return (
    <div className="space-y-6">
      {/* Section toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowForm(true)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            showForm
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Đăng ký lô mới
        </button>
        <button
          onClick={() => setShowForm(false)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            !showForm
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Danh sách lô ({batches.length})
        </button>
      </div>

      {/* Registration form */}
      {showForm && <ProductForm onSuccess={handleSuccess} />}

      {/* Batch list */}
      {!showForm && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-blue-500" />
              <h2 className="font-semibold text-zinc-800">
                Tất cả lô hàng
                {batches.length > 0 && (
                  <span className="ml-2 font-normal text-zinc-400">({batches.length})</span>
                )}
              </h2>
            </div>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["batches"] })}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              <RefreshCw className="h-3 w-3" />
              Làm mới
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
                <Boxes className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-600">Chưa có lô hàng nào</p>
              <p className="text-xs text-zinc-400">Dùng tab "Đăng ký lô mới" để bắt đầu.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Đăng ký ngay
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <BatchRow key={batch.id || batch.batchHash} batch={batch} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Boxes, RefreshCw } from "lucide-react";
import { getBatches } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";

function BatchRow({ batch, t }: { batch: Batch; t: (key: string) => string }) {
  const isRecalled = !!batch.recalledAt;
  const originLabel = batch.origin === "IMPORTED" ? t("Nhập khẩu") : t("Sản xuất");

  return (
    <Link
      href={`/dashboard/products/batches/${encodeURIComponent(batch.id || batch.batchHash)}`}
      className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-blue-500/50"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-zinc-800 dark:text-zinc-100">{batch.productName}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isRecalled ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
            {isRecalled ? t("Đã thu hồi") : originLabel}
          </span>
        </div>
        <p className="truncate font-mono text-xs text-zinc-400 dark:text-zinc-500">{batch.batchQR || batch.id}</p>
        <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{t("Số lượng")}: {batch.quantity}</span>
          <span>{t("Hạn dùng")}: {batch.expiryDate}</span>
          <span>{batch.manufacturerName}</span>
        </div>
      </div>
      <ArrowRight className="ml-4 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-blue-500 dark:text-zinc-600 dark:group-hover:text-blue-300" />
    </Link>
  );
}

export default function BatchManagementPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const t = useTranslation();
  const { data: batches = [], isLoading } = useQuery<Batch[]>({ queryKey: ["batches"], queryFn: getBatches });

  const filteredBatches = batches.filter((batch) => {
    if (statusFilter === "RECALLED") return !!batch.recalledAt;
    if (statusFilter === "ACTIVE") return !batch.recalledAt;
    return true;
  });

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("Quản lý lô hàng")}</h1>
          <p className="text-muted-foreground">{t("Xem lại các lô đã đăng ký, trạng thái thu hồi và serial bên trong từng lô.")}</p>
        </div>
        <Link href="/dashboard/products/register" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{t("Đăng ký sản phẩm")}</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-blue-500" />
          <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">{t("Tất cả lô hàng")}{batches.length > 0 ? <span className="ml-2 font-normal text-zinc-400">({batches.length})</span> : null}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">{t("Tất cả trạng thái")}</option>
            <option value="ACTIVE">{t("Hoạt động")}</option>
            <option value="RECALLED">{t("Đã thu hồi")}</option>
          </select>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["batches"] })} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">
            <RefreshCw className="h-3 w-3" />
            {t("Làm mới")}
          </button>
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/30">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />)}</div>
        ) : filteredBatches.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-14 text-center dark:border-zinc-700">
            <Boxes className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{t("Không tìm thấy lô hàng.")}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("Đăng ký một sản phẩm để tạo lô hàng đầu tiên.")}</p>
            <Link href="/dashboard/products/register" className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">{t("Đăng ký sản phẩm")}</Link>
          </div>
        ) : (
          <div className="max-h-[min(58vh,580px)] space-y-2 overflow-y-auto pr-1">
            {filteredBatches.map((batch) => <BatchRow key={batch.id || batch.batchHash} batch={batch} t={t} />)}
          </div>
        )}
      </section>
    </div>
  );
}

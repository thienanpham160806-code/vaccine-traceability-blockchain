"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { RegisterProductResponse } from "@/lib/api";
import { useTranslation } from "@/providers/LanguageProvider";

function truncateHash(value?: string) {
  if (!value) return "";
  return value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

export function LotResultCard({ data }: { data: RegisterProductResponse }) {
  const t = useTranslation();

  const csvHref = useMemo(() => {
    if (typeof window === "undefined") return "";
    const csv = ["serialId,unitIdHash", ...data.serials.map((serialId, i) => `${serialId},${data.unitIdHashes[i] || ""}`)].join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [data.serials, data.unitIdHashes]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none">
      <div className="border-b border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
        <h3 className="text-lg font-bold text-zinc-900">{t("Đã commission lô on-chain")}</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {data.serials.length} serial · 1 giao dịch commissionLot duy nhất
        </p>
      </div>
      <div className="space-y-4 p-6">
        <div>
          <p className="text-sm font-semibold text-zinc-700">{t("Mã lô")}</p>
          <p className="font-mono text-sm text-muted-foreground">{data.lot.id}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-700">Aggregation Root</p>
          <p className="break-all font-mono text-xs text-muted-foreground" title={data.aggregationRoot}>
            {truncateHash(data.aggregationRoot)}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-700">Lot ID Hash</p>
          <p className="break-all font-mono text-xs text-muted-foreground" title={data.lotIdHash}>
            {truncateHash(data.lotIdHash)}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-700">{t("Serial đã sinh")}</p>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
            {data.serials.slice(0, 20).map((serialId) => (
              <p key={serialId} className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
                {serialId}
              </p>
            ))}
            {data.serials.length > 20 ? (
              <p className="mt-1 text-xs font-semibold text-zinc-400">+{data.serials.length - 20} {t("serial khác")}</p>
            ) : null}
          </div>
        </div>
        {data.ipfsCid ? (
          <div>
            <p className="text-sm font-semibold text-zinc-700">IPFS CID</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{data.ipfsCid}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <a
            href={csvHref}
            download={`${data.lot.id}-serials.csv`}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <Download className="h-3.5 w-3.5" /> {t("Tải CSV")}
          </a>
          <Link
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            href={`/dashboard/products/batches/${encodeURIComponent(data.lot.id)}`}
          >
            {t("Xem chi tiết lô")}
          </Link>
          <Link
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
            href={`/dashboard/transfers/create?lotId=${encodeURIComponent(data.lot.id)}`}
          >
            {t("Chuyển cả lô")}
          </Link>
        </div>
      </div>
    </div>
  );
}

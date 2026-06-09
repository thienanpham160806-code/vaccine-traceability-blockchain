"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ExternalLink, Plus, Search, Truck, XCircle } from "lucide-react";
import { getTransfers } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { getStatusChipClass, getTransferStatusLabel } from "@/lib/status";
import type { TransferRecord, TransferStatus } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const statusOptions: Array<TransferStatus | "ALL"> = ["ALL", "PENDING", "CONFIRMED", "REJECTED", "RETURNED"];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delay]);
  return debounced;
}

function formatTime(timestamp: number | undefined, language: "en" | "vi") {
  return timestamp ? new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "vi-VN") : language === "en" ? "Unknown" : "Không rõ";
}

function shortAddress(address: string | undefined, language: "en" | "vi") {
  if (!address) return language === "en" ? "Unknown" : "Không rõ";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const TransferCard = memo(function TransferCard({
  transfer,
  user,
  language,
  t,
}: {
  transfer: TransferRecord;
  user: DemoUser | null;
  language: "en" | "vi";
  t: (key: string) => string;
}) {
  const canAct = transfer.status === "PENDING" && (user?.role === transfer.toRole || user?.role === "ADMIN");
  const rejectionReason = transfer.rejectedReason;
  const isRejected = transfer.status === "REJECTED" || transfer.status === "RETURNED";

  return (
    <Link
      href={`/dashboard/transfers/${encodeURIComponent(transfer.id)}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none dark:hover:border-blue-500/60 dark:hover:bg-zinc-900/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-100">{transfer.serialId || t("Chưa có serial")}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {translateRole(transfer.fromRole || "", language) || t("Không rõ")} <ArrowRight className="inline h-3 w-3" /> {translateRole(transfer.toRole || "", language) || t("Không rõ")}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusChipClass(transfer.status)}`}>
          {getTransferStatusLabel(transfer.status, language)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">{t("Từ")}</p>
          <p className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{shortAddress(transfer.fromAddress, language)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">{t("Đến")}</p>
          <p className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{shortAddress(transfer.toAddress, language)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">{t("Cập nhật")}</p>
          <p className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{formatTime(transfer.updatedAt || transfer.createdAt, language)}</p>
        </div>
      </div>

      {isRejected && rejectionReason ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-bold">{t("Lý do từ chối")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{rejectionReason}</p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${
          canAct ? "bg-amber-50 text-amber-700" : "bg-zinc-50 text-zinc-500"
        }`}>
          {canAct ? <Clock className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
          {canAct ? t("Cần bạn xử lý") : t("Xem chi tiết")}
        </span>
        <ExternalLink className="h-4 w-4 text-zinc-300" />
      </div>
    </Link>
  );
});

export default function TransfersPage() {
  const t = useTranslation();
  const { language } = useLanguage();
  const [user] = useState<DemoUser | null>(() => (typeof window === "undefined" ? null : getStoredUser()));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [status, setStatus] = useState<TransferStatus | "ALL">(() => {
    if (typeof window === "undefined") return "ALL";
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status") as TransferStatus | null;
    if (initialStatus && statusOptions.includes(initialStatus)) {
      return initialStatus;
    }
    return "ALL";
  });

  const { data: transfers = [], isLoading } = useQuery<TransferRecord[]>({
    queryKey: ["transfers"],
    queryFn: getTransfers,
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return transfers.filter((transfer) => {
      const matchesStatus = status === "ALL" || transfer.status === status;
      const matchesSearch =
        !q ||
        transfer.serialId?.toLowerCase().includes(q) ||
        transfer.batchId?.toLowerCase().includes(q) ||
        transfer.fromRole?.toLowerCase().includes(q) ||
        transfer.toRole?.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [debouncedSearch, status, transfers]);

  const pendingCount = transfers.filter((transfer) => transfer.status === "PENDING").length;

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{t("Lệnh chuyển")}</h1>
          <p className="text-sm text-zinc-500">{t("Theo dõi yêu cầu chuyển giao, xác nhận và từ chối bàn giao.")}</p>
        </div>
        <Link
          href="/dashboard/transfers/create"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("Tạo lệnh chuyển")}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
          <p className="text-2xl font-bold text-zinc-900">{transfers.length}</p>
          <p className="text-xs text-zinc-500">{t("Tổng lệnh chuyển")}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-2xl font-bold text-amber-800">{pendingCount}</p>
          <p className="text-xs text-amber-700">{t("Chờ xác nhận")}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
          <p className="text-2xl font-bold text-zinc-900">
            {transfers.filter((transfer) => user?.role && transfer.toRole === user.role && transfer.status === "PENDING").length}
          </p>
          <p className="text-xs text-zinc-500">{t("Cần vai trò của bạn")}</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-800 dark:bg-zinc-900">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none dark:text-zinc-100"
              placeholder={t("Tìm theo serial, mã lô hoặc vai trò")}
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {statusOptions.map((option) => (
              <button
                key={option}
                onClick={() => setStatus(option)}
                className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold ${
                  status === option
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                {option === "ALL" ? t("Tất cả") : getTransferStatusLabel(option, language)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white py-14 text-center">
          <XCircle className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-600">{t("Không tìm thấy lệnh chuyển")}</p>
          <p className="mt-1 text-xs text-zinc-400">{t("Hãy thử trạng thái hoặc serial khác.")}</p>
        </div>
      ) : (
        <div className="max-h-[540px] overflow-y-auto pr-1 lg:max-h-[calc(100dvh-28rem)]">
          <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((transfer) => (
            <TransferCard key={transfer.id} transfer={transfer} user={user} language={language} t={t} />
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

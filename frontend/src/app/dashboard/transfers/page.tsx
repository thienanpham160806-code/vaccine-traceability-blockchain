"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock, ExternalLink, Plus, Search, Truck, XCircle } from "lucide-react";
import { getTransfers } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { getStatusChipClass, getTransferStatusLabel } from "@/lib/status";
import type { TransferRecord, TransferStatus } from "@/lib/types";

const statusOptions: Array<TransferStatus | "ALL"> = ["ALL", "PENDING", "CONFIRMED", "REJECTED", "RETURNED"];
const statusOptionLabel: Record<string, string> = {
  ALL: "Tất cả",
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  RETURNED: "Đã hoàn trả",
};

function formatTime(timestamp?: number) {
  return timestamp ? new Date(timestamp).toLocaleString("vi-VN") : "Không rõ";
}

function shortAddress(address?: string) {
  if (!address) return "Không rõ";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function TransferCard({ transfer, user }: { transfer: TransferRecord; user: DemoUser | null }) {
  const canAct = transfer.status === "PENDING" && (user?.role === transfer.toRole || user?.role === "ADMIN");

  return (
    <Link
      href={`/dashboard/transfers/${encodeURIComponent(transfer.id)}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-zinc-800">{transfer.serialId || "Chưa có serial"}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {transfer.fromRole || "UNKNOWN"} <ArrowRight className="inline h-3 w-3" /> {transfer.toRole || "UNKNOWN"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusChipClass(transfer.status)}`}>
          {getTransferStatusLabel(transfer.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-zinc-500 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Từ</p>
          <p className="mt-1 font-semibold text-zinc-700">{shortAddress(transfer.fromAddress)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Đến</p>
          <p className="mt-1 font-semibold text-zinc-700">{shortAddress(transfer.toAddress)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Cập nhật</p>
          <p className="mt-1 font-semibold text-zinc-700">{formatTime(transfer.updatedAt || transfer.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${
          canAct ? "bg-amber-50 text-amber-700" : "bg-zinc-50 text-zinc-500"
        }`}>
          {canAct ? <Clock className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
          {canAct ? "Cần bạn xử lý" : "Xem chi tiết"}
        </span>
        <ExternalLink className="h-4 w-4 text-zinc-300" />
      </div>
    </Link>
  );
}

export default function TransfersPage() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransferStatus | "ALL">("ALL");

  useEffect(() => {
    setUser(getStoredUser());
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status") as TransferStatus | null;
    if (initialStatus && statusOptions.includes(initialStatus)) {
      setStatus(initialStatus);
    }
  }, []);

  const { data: transfers = [], isLoading } = useQuery<TransferRecord[]>({
    queryKey: ["transfers"],
    queryFn: getTransfers,
    refetchInterval: 8000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
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
  }, [search, status, transfers]);

  const pendingCount = transfers.filter((transfer) => transfer.status === "PENDING").length;

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Lệnh chuyển giao</h1>
          <p className="text-sm text-zinc-500">Theo dõi yêu cầu chuyển giao, xác nhận và từ chối bàn giao.</p>
        </div>
        <Link
          href="/dashboard/scan-transfer"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tạo lệnh chuyển
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-zinc-900">{transfers.length}</p>
          <p className="text-xs text-zinc-500">Tổng lệnh chuyển</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-2xl font-bold text-amber-800">{pendingCount}</p>
          <p className="text-xs text-amber-700">Chờ xác nhận</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-zinc-900">
            {transfers.filter((transfer) => user?.role && transfer.toRole === user.role && transfer.status === "PENDING").length}
          </p>
          <p className="text-xs text-zinc-500">Cần vai trò của bạn</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none"
              placeholder="Tìm theo serial, mã lô hoặc vai trò"
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
                    : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                {statusOptionLabel[option] || option}
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
          <p className="text-sm font-semibold text-zinc-600">Không tìm thấy lệnh chuyển</p>
          <p className="mt-1 text-xs text-zinc-400">Hãy thử trạng thái hoặc serial khác.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((transfer) => (
            <TransferCard key={transfer.id} transfer={transfer} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

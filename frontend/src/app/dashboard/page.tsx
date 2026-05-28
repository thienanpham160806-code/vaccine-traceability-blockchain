"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ShieldAlert,
  Truck,
  Zap,
} from "lucide-react";
import { getDashboardOverview, getHealth, getProducts } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";

const statusChip: Record<string, string> = {
  IN_TRANSIT: "bg-blue-50 text-blue-700 border-blue-200",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FLAGGED: "bg-red-50 text-red-700 border-red-200",
  REGISTERED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const statusLabel: Record<string, string> = {
  IN_TRANSIT: "Đang vận chuyển",
  VERIFIED: "Đã xác thực",
  FLAGGED: "Bị gắn cờ",
  REGISTERED: "Đã đăng ký",
};

export default function DashboardPage() {
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    staleTime: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: getDashboardOverview,
    staleTime: 15_000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-recent"],
    queryFn: () => getProducts({ page: 1, pageSize: 6, sort: "createdAt:desc" }),
    select: (data) => data.items,
    staleTime: 15_000,
  });

  const statCards = [
    {
      label: "Tổng lô hàng",
      value: stats?.totalBatches ?? "—",
      icon: Boxes,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      label: "Tổng serial",
      value: stats?.totalSerials ?? "—",
      icon: Activity,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      label: "Chờ xác nhận",
      value: stats?.pendingTransfers ?? "—",
      icon: Truck,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "Cảnh báo rủi ro",
      value: stats?.riskAlerts ?? "—",
      icon: ShieldAlert,
      color: "text-red-500",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            {user ? `Chào mừng, ${user.role}` : "Bảng điều khiển"}
          </h1>
          <p className="text-sm text-zinc-500">
            Giám sát lô vaccine, chuyển giao và cảnh báo rủi ro.
          </p>
        </div>

        {/* System status */}
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              health?.status === "ok" ? "bg-emerald-500" : "bg-red-400"
            }`}
          />
          <span className="font-mono text-xs text-zinc-600">
            {health?.status === "ok" ? "BACKEND ONLINE" : "BACKEND OFFLINE"}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.bg}`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{card.value}</p>
                <p className="text-xs text-zinc-500">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/dashboard/products/register"
          className="flex items-center justify-between rounded-xl border border-blue-100 bg-gradient-to-r from-blue-600 to-cyan-500 p-4 text-white shadow-sm transition hover:opacity-90"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Bắt đầu</p>
            <p className="font-bold">Đăng ký lô hàng</p>
          </div>
          <ArrowRight className="h-5 w-5 opacity-70" />
        </Link>

        <Link
          href="/dashboard/scan-transfer"
          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:bg-zinc-50"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Thao tác</p>
            <p className="font-bold text-zinc-800">Tạo lệnh chuyển</p>
          </div>
          <Truck className="h-5 w-5 text-zinc-400" />
        </Link>

        <Link
          href="/dashboard/products"
          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:bg-zinc-50"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Xem</p>
            <p className="font-bold text-zinc-800">Danh sách sản phẩm</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-zinc-400" />
        </Link>
      </div>

      {/* Recent products */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500" />
            <h3 className="font-semibold text-zinc-800">Sản phẩm gần đây</h3>
          </div>
          <Link
            href="/dashboard/products"
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            Xem tất cả <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="divide-y divide-zinc-100">
          {products.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-zinc-400">
              Chưa có sản phẩm nào được đăng ký.
            </p>
          ) : (
            products.map((product) => (
              <div
                key={product.serialId}
                className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-800">{product.productName}</p>
                  <p className="font-mono text-xs text-zinc-400">
                    {product.serialId} · Lô {product.batchId}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    statusChip[product.status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
                  }`}
                >
                  {statusLabel[product.status] ?? product.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

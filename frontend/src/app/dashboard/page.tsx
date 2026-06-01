"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  PackagePlus,
  RotateCcw,
  ShieldAlert,
  Truck,
  Zap,
} from "lucide-react";
import { getDashboardOverview, getDashboardRecentActivity, getHealth } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { getProductStatusLabel, getStatusChipClass, getTransferStatusLabel } from "@/lib/status";
import type { DashboardActivity } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const activityIcon = {
  PRODUCT: CheckCircle2,
  TRANSFER: Truck,
  RISK: ShieldAlert,
  RECALL: RotateCcw,
};

function formatTime(timestamp: number, language: "en" | "vi") {
  if (!timestamp) return language === "en" ? "Unknown time" : "Không rõ";
  return new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "vi-VN");
}

function roleActions(role?: string) {
  const base = [
    { label: "Sản phẩm", href: "/dashboard/products", icon: CheckCircle2, tone: "white" },
    { label: "Lệnh chuyển", href: "/dashboard/transfers", icon: Truck, tone: "white" },
  ];

  if (role === "MANUFACTURER" || role === "IMPORTER" || role === "ADMIN") {
    return [
      { label: "Đăng ký lô", href: "/dashboard/products/batches", icon: PackagePlus, tone: "primary" },
      { label: "Tạo lệnh chuyển", href: "/dashboard/transfers/create", icon: Truck, tone: "white" },
      ...base.slice(0, 1),
    ];
  }

  if (role === "DISTRIBUTOR") {
    return [
      { label: "Lệnh chờ xác nhận", href: "/dashboard/transfers?status=PENDING", icon: Clock, tone: "primary" },
      { label: "Tạo lệnh chuyển", href: "/dashboard/transfers/create", icon: Truck, tone: "white" },
      ...base.slice(0, 1),
    ];
  }

  if (role === "CLINIC" || role === "PHARMACY") {
    return [
      { label: "Lệnh chờ xác nhận", href: "/dashboard/transfers?status=PENDING", icon: Clock, tone: "primary" },
      ...base.slice(0, 1),
    ];
  }

  if (role === "RECALL_AUTHORITY") {
    return [
      { label: "Thu hồi", href: "/dashboard/recall", icon: RotateCcw, tone: "primary" },
      { label: "Rủi ro", href: "/dashboard/risk-dispute", icon: ShieldAlert, tone: "white" },
      ...base.slice(0, 1),
    ];
  }

  return base;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="min-h-[104px] rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        {hint ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{hint}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

function ActivityRow({ item, language }: { item: DashboardActivity; language: "en" | "vi" }) {
  const Icon = activityIcon[item.type] ?? Activity;
  const statusText = item.type === "TRANSFER" ? getTransferStatusLabel(item.status, language) : getProductStatusLabel(item.status, language);

  return (
    <Link
      href={item.href || "/dashboard"}
      className="group flex min-h-[64px] items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-50 dark:hover:bg-blue-950/30 sm:px-5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-blue-200">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{item.title || item.type}</p>
        <p className="truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-400">{item.subtitle || (language === "en" ? "No details" : "Không có chi tiết")}</p>
      </div>
      <div className="hidden text-right sm:block">
        {item.status ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusChipClass(item.status)}`}>
            {statusText}
          </span>
        ) : null}
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-400">{formatTime(item.timestamp, language)}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-400" />
    </Link>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const t = useTranslation();
  const { language } = useLanguage();

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

  const { data: activity = [] } = useQuery<DashboardActivity[]>({
    queryKey: ["dashboard-recent-activity"],
    queryFn: () => getDashboardRecentActivity(10),
    staleTime: 15_000,
  });

  const trendTotal = useMemo(
    () => stats?.last7DaysTrend?.reduce((sum, day) => sum + day.count, 0) ?? 0,
    [stats?.last7DaysTrend]
  );
  const actions = roleActions(user?.role);

  return (
    <div className="space-y-4 pb-20 lg:pb-0 bg-white dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {user ? `${t("Xin chào")}, ${translateRole(user.role, language)}` : t("Tổng quan")}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("Theo dõi lô vaccine, chuyển giao, thu hồi và cảnh báo vận hành.")}</p>
        </div>

        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <span className={`h-2 w-2 rounded-full ${health?.status === "ok" ? "bg-emerald-500" : "bg-red-400"}`} />
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
            {health?.status === "ok" ? t("Backend đang hoạt động") : t("Backend mất kết nối")}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t("Lô hàng")} value={stats?.totalBatches ?? "-"} icon={Boxes} tone="bg-blue-50 text-blue-600" />
        <StatCard label={t("Sản phẩm")} value={stats?.totalProducts ?? stats?.totalSerials ?? "-"} icon={Activity} tone="bg-emerald-50 text-emerald-600" />
        <StatCard label={t("Lệnh chờ xác nhận")} value={stats?.pendingTransfers ?? "-"} icon={Truck} tone="bg-amber-50 text-amber-600" />
        <StatCard label={t("Cảnh báo rủi ro")} value={stats?.riskAlerts ?? "-"} icon={ShieldAlert} tone="bg-red-50 text-red-600" />
        <StatCard label={t("Lô đã thu hồi")} value={stats?.recalledBatches ?? 0} icon={RotateCcw} tone="bg-zinc-100 text-zinc-600" hint={`${trendTotal} / ${t("7 ngày")}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const primary = action.tone === "primary";
          return (
            <Link
              key={action.href + action.label}
              href={action.href}
              className={`flex min-h-14 items-center justify-between rounded-lg border p-4 text-sm font-bold shadow-sm transition ${
                primary
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{t(action.label)}</span>
              <Icon className={`h-5 w-5 ${primary ? "text-white/80" : "text-zinc-400 dark:text-zinc-400"}`} />
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="flex max-h-[340px] min-h-[260px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">{t("Hoạt động gần đây")}</h2>
            </div>
            <Link href="/dashboard/transfers" className="flex min-h-11 items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-300">
              {t("Lệnh chuyển")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto dark:divide-transparent">
            {activity.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-zinc-400 dark:text-zinc-400">{t("Chưa có hoạt động gần đây.")}</p>
            ) : (
              activity.map((item) => <ActivityRow key={item.id} item={item} language={language} />)
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">{t("7 ngày gần đây")}</h2>
          </div>
          <div className="mt-3 flex h-[7.5rem] items-end gap-2">
            {(stats?.last7DaysTrend || []).map((day) => {
              const max = Math.max(...(stats?.last7DaysTrend || []).map((d) => d.count), 1);
              const height = Math.max(8, Math.round((day.count / max) * 100));
              return (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end rounded bg-white px-1 dark:bg-zinc-800">
                    <div
                      className="group relative w-full rounded bg-blue-500 transition-colors hover:bg-blue-600"
                      style={{ height: `${height}%` }}
                    >
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg ring-1 ring-zinc-800 transition-opacity group-hover:opacity-100 dark:bg-white dark:text-zinc-950 dark:ring-zinc-200">
                        {day.count}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{day.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}


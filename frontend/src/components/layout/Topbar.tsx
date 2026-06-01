"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, LogOut, Menu, Wallet } from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";
import { getDashboardRecentActivity } from "@/lib/api";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import type { DashboardActivity } from "@/lib/types";

type BreadcrumbItem = {
  title: string;
  href?: string;
};

type PageMeta = {
  title: string;
  sub: string;
  breadcrumbs?: BreadcrumbItem[];
};

const pageTitles: Record<string, PageMeta> = {
  "/dashboard": { title: "Tổng quan", sub: "Bảng điều khiển hệ thống" },
  "/dashboard/batches": { title: "Lô hàng", sub: "Đăng ký và theo dõi lô vaccine" },
  "/dashboard/products": { title: "Sản phẩm", sub: "Danh sách serial đã đăng ký" },
  "/dashboard/transfers": { title: "Lệnh chuyển", sub: "Quản lý yêu cầu chuyển giao" },
  "/dashboard/scan-transfer": { title: "Tạo lệnh chuyển", sub: "Tạo yêu cầu bàn giao" },
  "/dashboard/risk-dispute": { title: "Rủi ro & tranh chấp", sub: "Theo dõi cảnh báo và khiếu nại" },
  "/dashboard/recall": { title: "Thu hồi", sub: "Quản lý thu hồi lô vaccine" },
};

function withDefaultBreadcrumb(meta: PageMeta): PageMeta {
  return {
    ...meta,
    breadcrumbs: meta.breadcrumbs ?? [{ title: meta.title }],
  };
}

function getPageMeta(pathname: string): PageMeta {
  if (pageTitles[pathname]) return withDefaultBreadcrumb(pageTitles[pathname]);
  if (pathname === "/dashboard/products/register") {
    return {
      title: "Đăng ký sản phẩm",
      sub: "Tạo serial sản phẩm mới",
      breadcrumbs: [
        { title: "Sản phẩm", href: "/dashboard/products" },
        { title: "Đăng ký sản phẩm" },
      ],
    };
  }
  if (pathname === "/dashboard/products/bulk") {
    return {
      title: "Đăng ký hàng loạt",
      sub: "Tạo nhiều serial sản phẩm",
      breadcrumbs: [
        { title: "Sản phẩm", href: "/dashboard/products" },
        { title: "Đăng ký hàng loạt" },
      ],
    };
  }
  if (pathname.startsWith("/dashboard/batches/")) {
    return {
      title: "Chi tiết lô",
      sub: "Serial, QR và lịch sử",
      breadcrumbs: [
        { title: "Lô hàng", href: "/dashboard/batches" },
        { title: "Chi tiết lô" },
      ],
    };
  }
  if (pathname.startsWith("/dashboard/products/")) {
    return {
      title: "Chi tiết sản phẩm",
      sub: "Nguồn gốc, chủ sở hữu và lịch sử",
      breadcrumbs: [
        { title: "Sản phẩm", href: "/dashboard/products" },
        { title: "Chi tiết sản phẩm" },
      ],
    };
  }
  if (pathname.startsWith("/dashboard/transfers/")) {
    return {
      title: "Chi tiết lệnh chuyển",
      sub: "Bản ghi chuyển giao trên Blockchain",
      breadcrumbs: [
        { title: "Lệnh chuyển", href: "/dashboard/transfers" },
        { title: "Chi tiết lệnh chuyển" },
      ],
    };
  }
  if (pathname.startsWith("/dashboard/verify/")) {
    return {
      title: "Xác minh",
      sub: "Tính xác thực và lịch sử sản phẩm",
      breadcrumbs: [{ title: "Xác minh" }],
    };
  }
  return withDefaultBreadcrumb({ title: "Dashboard", sub: "VaxiTrust" });
}

const roleColor: Record<string, string> = {
  MANUFACTURER: "bg-blue-50 text-blue-700 border-blue-200",
  IMPORTER: "bg-purple-50 text-purple-700 border-purple-200",
  DISTRIBUTOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLINIC: "bg-amber-50 text-amber-700 border-amber-200",
  PHARMACY: "bg-cyan-50 text-cyan-700 border-cyan-200",
  PUBLIC: "bg-white text-zinc-700 border-zinc-200",
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  RECALL_AUTHORITY: "bg-orange-50 text-orange-700 border-orange-200",
};

const fallbackAudienceRoles = ["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "CLINIC", "PHARMACY", "RECALL_AUTHORITY", "ADMIN"];

function getNotificationStorageKey(user: DemoUser | null) {
  if (!user) return null;
  return `notifications:readIds:${user.role}:${user.address.toLowerCase()}`;
}

function loadReadNotificationIds(storageKey: string | null) {
  if (!storageKey) return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function formatNotificationTime(timestamp: number, language: "en" | "vi") {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function getNotificationTitle(activity: DashboardActivity, language: "en" | "vi", t: (key: string) => string) {
  if (activity.type === "TRANSFER") return `${t("Lệnh chuyển")} ${getTransferStatusLabel(activity.status, language)}`.trim();
  if (activity.type === "RISK") return t("Cảnh báo rủi ro");
  if (activity.type === "RECALL") return t("Thông báo thu hồi");
  return t("Cập nhật sản phẩm");
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = useTranslation();
  const [user, setUser] = useState<DemoUser | null>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const meta = getPageMeta(pathname);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);

    const storageKey = getNotificationStorageKey(storedUser);
    setReadNotificationIds(loadReadNotificationIds(storageKey));
  }, []);

  const { data: activities = [] } = useQuery({
    queryKey: ["topbar-notifications", user?.role, user?.address],
    queryFn: () => getDashboardRecentActivity(50),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const roleNotifications = useMemo(() => {
    if (!user) return [];

    return activities.filter((activity) => {
      const audience = activity.audienceRoles?.length ? activity.audienceRoles : fallbackAudienceRoles;
      return user.role === "ADMIN" || audience.includes(user.role);
    });
  }, [activities, user]);

  const visibleNotifications = roleNotifications.slice(0, 8);
  const readNotificationIdSet = useMemo(() => new Set(readNotificationIds), [readNotificationIds]);
  const unreadCount = roleNotifications.filter((activity) => !readNotificationIdSet.has(activity.id)).length;

  const markNotificationsRead = () => {
    const storageKey = getNotificationStorageKey(user);
    if (!storageKey) return;

    const nextIds = Array.from(new Set([...readNotificationIds, ...roleNotifications.map((activity) => activity.id)]));
    window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
    setReadNotificationIds(nextIds);
  };

  const markNotificationRead = (notificationId: string) => {
    const storageKey = getNotificationStorageKey(user);
    if (!storageKey || readNotificationIdSet.has(notificationId)) return;

    const nextIds = [...readNotificationIds, notificationId];
    window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
    setReadNotificationIds(nextIds);
  };

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 lg:hidden"
          aria-label={t("Mở menu")}
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            <Link href="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-300">
              VaxiTrust
            </Link>
            {(meta.breadcrumbs ?? [{ title: meta.title }]).map((breadcrumb, index) => (
              <Fragment key={`${breadcrumb.title}-${index}`}>
                <ChevronRight className="h-3 w-3" />
                {breadcrumb.href ? (
                  <Link href={breadcrumb.href} className="truncate hover:text-blue-600 dark:hover:text-blue-300">
                    {t(breadcrumb.title)}
                  </Link>
                ) : (
                  <span className="truncate text-zinc-600 dark:text-zinc-300">{t(breadcrumb.title)}</span>
                )}
              </Fragment>
            ))}
          </div>
          <h2 className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t(meta.sub)}</h2>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className="relative hidden sm:block"
          onMouseEnter={() => setNotificationsOpen(true)}
          onMouseLeave={() => setNotificationsOpen(false)}
        >
          <button
            className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={() => setNotificationsOpen((current) => !current)}
            title={unreadCount > 0 ? `${unreadCount} ${t("thông báo chưa xem")}` : t("Không có thông báo mới")}
            type="button"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t("Thông báo")}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{unreadCount} {t("chưa xem cho")} {translateRole(user?.role || "", language) || t("role hiện tại")}</p>
                </div>
                {unreadCount > 0 ? (
                  <button
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    onClick={markNotificationsRead}
                    type="button"
                  >
                    {t("Đánh dấu đã xem")}
                  </button>
                ) : null}
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {visibleNotifications.length > 0 ? (
                  visibleNotifications.map((activity) => {
                    const unread = !readNotificationIdSet.has(activity.id);
                    return (
                      <Link
                        className="flex gap-3 border-b border-zinc-100 px-4 py-3 transition last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        href={activity.href}
                        key={activity.id}
                        onClick={() => markNotificationRead(activity.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className={`truncate text-sm ${unread ? "font-bold text-zinc-950 dark:text-zinc-50" : "font-medium text-zinc-700 dark:text-zinc-300"}`}>
                              {getNotificationTitle(activity, language, t)}
                            </p>
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-red-500" : "bg-blue-500"}`} />
                          </div>
                          <p className={`mt-1 line-clamp-2 text-xs ${unread ? "font-semibold text-zinc-700 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {activity.title}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                            <span className="truncate">{activity.subtitle}</span>
                            <span className="shrink-0">{formatNotificationTime(activity.timestamp, language)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{t("Chưa có thông báo cho role này.")}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {user ? (
          <div
            className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold sm:flex ${
                roleColor[user.role] ?? "bg-white text-zinc-700 border-zinc-200"
              }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>{translateRole(user.role, language)}</span>
            <span className="font-mono opacity-60">
              {user.address.slice(0, 6)}...{user.address.slice(-4)}
            </span>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("Đăng nhập")}
          </button>
        )}

        {user && (
          <button
            onClick={logout}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-zinc-800 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300"
            title={t("Đăng xuất")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

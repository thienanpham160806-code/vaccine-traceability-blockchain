"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, LogOut, Menu, Wallet } from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";

const pageTitles: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Tổng quan", sub: "Bảng điều khiển hệ thống" },
  "/dashboard/batches": { title: "Lô hàng", sub: "Đăng ký và theo dõi lô vaccine" },
  "/dashboard/products": { title: "Sản phẩm", sub: "Danh sách serial đã đăng ký" },
  "/dashboard/transfers": { title: "Lệnh chuyển", sub: "Quản lý yêu cầu chuyển giao" },
  "/dashboard/scan-transfer": { title: "Tạo lệnh chuyển", sub: "Tạo yêu cầu bàn giao" },
  "/dashboard/risk-dispute": { title: "Rủi ro & tranh chấp", sub: "Theo dõi cảnh báo và khiếu nại" },
  "/dashboard/recall": { title: "Thu hồi", sub: "Quản lý thu hồi lô vaccine" },
};

function getPageMeta(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/dashboard/batches/")) return { title: "Chi tiết lô", sub: "Serial, QR và lịch sử" };
  if (pathname.startsWith("/dashboard/transfers/")) return { title: "Chi tiết lệnh chuyển", sub: "Bản ghi chuyển giao trên Blockchain" };
  if (pathname.startsWith("/dashboard/verify/")) return { title: "Xác minh", sub: "Tính xác thực và lịch sử sản phẩm" };
  return { title: "Dashboard", sub: "VaxiTrust" };
}

const roleColor: Record<string, string> = {
  MANUFACTURER: "bg-blue-50 text-blue-700 border-blue-200",
  IMPORTER: "bg-purple-50 text-purple-700 border-purple-200",
  DISTRIBUTOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLINIC: "bg-amber-50 text-amber-700 border-amber-200",
  PHARMACY: "bg-cyan-50 text-cyan-700 border-cyan-200",
  PUBLIC: "bg-zinc-50 text-zinc-700 border-zinc-200",
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  RECALL_AUTHORITY: "bg-orange-50 text-orange-700 border-orange-200",
};

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<DemoUser | null>(null);
  const meta = getPageMeta(pathname);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] text-zinc-400">
            <Link href="/dashboard" className="hover:text-blue-600">VaxiTrust</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-zinc-600">{meta.title}</span>
          </div>
          <h2 className="truncate text-sm font-semibold text-zinc-800">{meta.sub}</h2>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button className="relative hidden h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 sm:flex">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        {user ? (
          <div
            className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold sm:flex ${
              roleColor[user.role] ?? "bg-zinc-50 text-zinc-700 border-zinc-200"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>{user.role}</span>
            <span className="font-mono opacity-60">
              {user.address.slice(0, 6)}...{user.address.slice(-4)}
            </span>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <Wallet className="h-3.5 w-3.5" />
            Đăng nhập
          </button>
        )}

        {user && (
          <button
            onClick={logout}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

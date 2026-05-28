"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, LogOut, Menu, Wallet } from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";

const pageTitles: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Tổng quan", sub: "Bảng điều khiển hệ thống" },
  "/dashboard/batches": { title: "Quản lý lô hàng", sub: "Đăng ký và theo dõi lô vaccine" },
  "/dashboard/products": { title: "Danh sách sản phẩm", sub: "Toàn bộ serial đã đăng ký" },
  "/dashboard/scan-transfer": { title: "Chuyển & Nhận", sub: "Quản lý lệnh chuyển giao" },
  "/dashboard/risk-dispute": { title: "Rủi ro & Tranh chấp", sub: "Giám sát cảnh báo và khiếu nại" },
  "/dashboard/recall": { title: "Thu hồi", sub: "Quản lý lệnh thu hồi sản phẩm" },
};

function getPageMeta(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/dashboard/batches/"))
    return { title: "Chi tiết lô hàng", sub: "Serials, QR và lịch sử" };
  if (pathname.startsWith("/dashboard/transfers/"))
    return { title: "Chi tiết chuyển giao", sub: "Thông tin lệnh trên blockchain" };
  return { title: "Dashboard", sub: "VaxiTrust" };
}

const roleColor: Record<string, string> = {
  MANUFACTURER: "bg-blue-50 text-blue-700 border-blue-200",
  IMPORTER: "bg-purple-50 text-purple-700 border-purple-200",
  DISTRIBUTOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CLINIC: "bg-amber-50 text-amber-700 border-amber-200",
};

export function Topbar() {
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6">
      {/* Left: breadcrumb + title */}
      <div className="flex items-center gap-3">
        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 lg:hidden">
          <Menu className="h-4 w-4" />
        </button>
        <div>
          <div className="flex items-center gap-1 text-[11px] text-zinc-400">
            <span>VaxiTrust</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-zinc-600">{meta.title}</span>
          </div>
          <h2 className="text-sm font-semibold text-zinc-800">{meta.sub}</h2>
        </div>
      </div>

      {/* Right: user info + actions */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        {/* Wallet chip */}
        {user ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              roleColor[user.role] ?? "bg-zinc-50 text-zinc-700 border-zinc-200"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            <span>{user.role}</span>
            <span className="font-mono opacity-60">
              {user.address.slice(0, 6)}…{user.address.slice(-4)}
            </span>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <Wallet className="h-3.5 w-3.5" />
            Đăng nhập
          </button>
        )}

        {/* Logout */}
        {user && (
          <button
            onClick={logout}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

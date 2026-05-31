"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  RotateCcw,
  Search,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";

const menuItems = [
  { title: "Tổng quan", href: "/dashboard", icon: LayoutDashboard },
  { title: "Lô hàng", href: "/dashboard/batches", icon: Boxes },
  { title: "Sản phẩm", href: "/dashboard/products", icon: ClipboardList },
  { title: "Lệnh chuyển", href: "/dashboard/transfers", icon: ListChecks },
  { title: "Tạo lệnh chuyển", href: "/dashboard/scan-transfer", icon: Truck },
  { title: "Rủi ro & tranh chấp", href: "/dashboard/risk-dispute", icon: ShieldAlert },
  { title: "Thu hồi", href: "/dashboard/recall", icon: RotateCcw },
];

const roleLabel: Record<string, string> = {
  MANUFACTURER: "Manufacturer",
  IMPORTER: "Importer",
  DISTRIBUTOR: "Distributor",
  CLINIC: "Clinic",
  PHARMACY: "Pharmacy",
  PUBLIC: "Public",
  ADMIN: "Admin",
  RECALL_AUTHORITY: "Recall Authority",
};

const roleColor: Record<string, string> = {
  MANUFACTURER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  IMPORTER: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DISTRIBUTOR: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CLINIC: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PHARMACY: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  PUBLIC: "bg-zinc-800 text-zinc-400 border-zinc-700",
  ADMIN: "bg-red-500/20 text-red-400 border-red-500/30",
  RECALL_AUTHORITY: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [serialId, setSerialId] = useState("");
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const goVerify = () => {
    if (serialId.trim()) {
      onNavigate?.();
      router.push(`/dashboard/verify/${encodeURIComponent(serialId.trim())}`);
    }
  };

  const logout = () => {
    clearSession();
    onNavigate?.();
    router.push("/login");
  };

  const visibleMenuItems = menuItems.filter((item) => {
    const role = user?.role;
    if (item.href === "/dashboard/scan-transfer") {
      return role === "MANUFACTURER" || role === "IMPORTER" || role === "DISTRIBUTOR" || role === "ADMIN";
    }
    if (item.href === "/dashboard/recall") {
      return role === "RECALL_AUTHORITY" || role === "ADMIN";
    }
    return true;
  });

  return (
    <aside className={`${mobile ? "flex h-full w-72" : "hidden min-h-screen w-64 lg:flex"} flex-col border-r border-zinc-800 bg-zinc-950`}>
      <Link href="/dashboard" onClick={onNavigate} className="flex min-h-16 items-center gap-3 border-b border-zinc-800 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20">
          <Activity className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">VaxiTrust</p>
          <p className="text-sm font-semibold text-white">Truy xuất vaccine</p>
        </div>
      </Link>

      {user && (
        <div className="px-4 pt-4">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
              roleColor[user.role] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {roleLabel[user.role] ?? user.role}
            <span className="ml-auto font-mono text-[10px] opacity-60">
              {user.address.slice(0, 6)}...{user.address.slice(-4)}
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-blue-600/15 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4 w-4 transition-colors ${active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Tra cứu serial
        </p>
        <div className="flex gap-1.5">
          <input
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            value={serialId}
            onChange={(event) => setSerialId(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && goVerify()}
            placeholder="VCN-DEMO-001"
          />
          <button
            onClick={goVerify}
            className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
            aria-label="Verify serial"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={logout}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}

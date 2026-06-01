"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Home, ListChecks, MoreHorizontal, Truck } from "lucide-react";
import { getStoredUser } from "@/lib/auth";
import { useTranslation } from "@/providers/LanguageProvider";
import { ContactFooter } from "./ContactFooter";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const bottomItems = [
  { title: "Tổng quan", href: "/dashboard", icon: Home },
  { title: "Sản phẩm", href: "/dashboard/products", icon: Boxes },
  { title: "Lệnh", href: "/dashboard/transfers", icon: ListChecks },
  { title: "Tạo lệnh", href: "/dashboard/scan-transfer", icon: Truck },
  { title: "Thêm", href: "/dashboard/batches", icon: MoreHorizontal },
];

function BottomNav() {
  const pathname = usePathname();
  const t = useTranslation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
      <div className="grid h-16 grid-cols-5">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${
                active ? "text-blue-600" : "text-zinc-500"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(item.title)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    const token = window.localStorage.getItem("demoToken");

    if (!user || !token) {
      router.replace("/login");
      return;
    }

    setIsReady(true);
  }, [router]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-200">
        {t("Đang kiểm tra phiên đăng nhập...")}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <Sidebar />

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t("Đóng menu")}
            className="absolute inset-0 bg-zinc-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full">
            <Sidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
          <ContactFooter className="mt-10 lg:-ml-[calc(16rem+1.5rem)] lg:w-[calc(100%+16rem+1.5rem)]" />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Home, ListChecks, QrCode, ShieldAlert, UserCheck } from "lucide-react";
import { getStoredUser, SESSION_UPDATED_EVENT, type DemoUser } from "@/lib/auth";
import {
  canAccessDashboardPath,
  canViewInternalProducts,
  canViewOperationalRisk,
  canViewTransfers,
  isEndUserRole,
  isPublicUser,
} from "@/lib/role-access";
import { useTranslation } from "@/providers/LanguageProvider";
import { ContactFooter } from "./ContactFooter";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

function getBottomItems(user: DemoUser | null) {
  const items = [{ title: "Tổng quan", href: "/dashboard", icon: Home }];
  if (canViewInternalProducts(user)) {
    items.push({ title: "Sản phẩm", href: "/dashboard/products", icon: Boxes });
  }
  items.push({ title: "Quét", href: "/dashboard/scan", icon: QrCode });
  if (canViewTransfers(user)) {
    items.push({
      title: isEndUserRole(user) ? "Lô chờ nhận" : "Lệnh",
      href: "/dashboard/transfers",
      icon: ListChecks,
    });
  }
  if (canViewOperationalRisk(user)) {
    items.push({ title: "Rủi ro", href: "/dashboard/risk-dispute", icon: ShieldAlert });
  } else if (isPublicUser(user)) {
    items.push({ title: "Yêu cầu role", href: "/dashboard/role-request", icon: UserCheck });
  }
  return items;
}

function BottomNav({ user }: { user: DemoUser | null }) {
  const pathname = usePathname();
  const t = useTranslation();
  const bottomItems = getBottomItems(user);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${bottomItems.length}, minmax(0, 1fr))` }}>
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
  const pathname = usePathname();
  const t = useTranslation();
  const [isReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(getStoredUser() && window.localStorage.getItem("demoToken"));
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [user, setUser] = useState<DemoUser | null>(() =>
    typeof window === "undefined" ? null : getStoredUser()
  );

  useEffect(() => {
    const currentUser = getStoredUser();
    const token = window.localStorage.getItem("demoToken");

    if (!currentUser || !token) {
      router.replace("/login");
      return;
    }

    if (!canAccessDashboardPath(currentUser, pathname)) {
      router.replace("/dashboard");
    }
  }, [pathname, router, user]);

  useEffect(() => {
    const handleSessionUpdate = () => {
      setMobileMenuOpen(false);
      setUser(getStoredUser());
      setSessionVersion((current) => current + 1);
    };
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdate);
    return () => window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdate);
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-200">
        {t("Đang kiểm tra phiên đăng nhập...")}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white dark:bg-zinc-950">
      <div className="flex min-h-screen min-w-0" key={sessionVersion}>
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

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileMenuOpen(true)} />

          <main className="min-w-0 flex-1 px-3 py-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
            {children}
          </main>
        </div>
      </div>

      <ContactFooter className="mx-4 mb-20 sm:mx-6 lg:mx-0 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0" />
      <BottomNav user={user} />
    </div>
  );
}


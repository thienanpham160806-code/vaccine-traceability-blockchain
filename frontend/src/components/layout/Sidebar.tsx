"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Boxes,
  Check,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Truck,
} from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { translateRole } from "@/lib/i18n";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";

const menuItems = [
  { title: "Tổng quan", href: "/dashboard", icon: LayoutDashboard },
  { title: "Lô hàng", href: "/dashboard/batches", icon: Boxes },
  { title: "Sản phẩm", href: "/dashboard/products", icon: ClipboardList },
  { title: "Lệnh chuyển", href: "/dashboard/transfers", icon: ListChecks },
  { title: "Tạo lệnh chuyển", href: "/dashboard/scan-transfer", icon: Truck },
  { title: "Rủi ro & tranh chấp", href: "/dashboard/risk-dispute", icon: ShieldAlert },
  { title: "Thu hồi", href: "/dashboard/recall", icon: RotateCcw },
];

const themeOptions = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
] as const;

const languageOptions = [
  { value: "en", label: "EN", flag: "https://flagcdn.com/gb.svg" },
  { value: "vi", label: "VI", flag: "https://flagcdn.com/vn.svg" },
] as const;

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
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = useTranslation();
  const [serialId, setSerialId] = useState("");
  const [user] = useState<DemoUser | null>(() => {
    if (typeof window === "undefined") return null;
    return getStoredUser();
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsOpen]);

  const handleLanguageChange = (value: "en" | "vi") => {
    setLanguage(value);
  };

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
    <aside className={`${mobile ? "flex h-full w-72" : "hidden min-h-screen w-64 lg:flex"} flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950`}>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex min-h-16 items-center border-b border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <VaxiTrustLogo
          className="h-12 w-12"
          iconClassName="h-7 w-7"
          showWordmark
          wordmarkClassName="text-2xl text-white"
        />
      </Link>

      {user && (
        <div className="px-4 pt-4">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
              roleColor[user.role] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {translateRole(user.role, language)}
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
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4 w-4 transition-colors ${active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
              {t(item.title)}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          {t("Tra cứu serial")}
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
            aria-label={t("Xác minh serial")}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <a
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
          href="mailto:support@vaxitrust.local"
        >
          <HelpCircle className="h-4 w-4" />
          {t("Hỗ trợ")}
        </a>

        <button
          onClick={logout}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          {t("Đăng xuất")}
        </button>

        <div ref={settingsRef} className="relative">
          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            onClick={() => setSettingsOpen((current) => !current)}
            type="button"
            aria-expanded={settingsOpen}
            aria-haspopup="true"
          >
            <Settings className="h-4 w-4" />
            {t("Cài đặt")}
          </button>

          {settingsOpen ? (
            <div className="absolute bottom-0 left-full z-50 ml-2 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <div className="space-y-2">
                <div>
                  <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    {t("Giao diện")}
                  </p>
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = (theme || "system") === option.value;
                    return (
                      <button
                        className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm transition ${
                          selected
                            ? "bg-blue-600/15 text-blue-400"
                            : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        }`}
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        type="button"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{t(option.label)}</span>
                        {selected ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <p className="px-2 pb-2 pt-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    {t("Ngôn ngữ")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {languageOptions.map((option) => {
                      const selected = language === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleLanguageChange(option.value)}
                          className={`flex h-11 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition ${
                            selected
                              ? "border-blue-500 bg-blue-600/15 text-blue-700 dark:text-blue-100"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
                          }`}
                        >
                          <span className="flex items-center justify-center">
                            {selected ? (
                              <img src={option.flag} alt={option.label} className="w-6 rounded-[2px] object-cover shadow-sm" />
                            ) : (
                              option.label
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

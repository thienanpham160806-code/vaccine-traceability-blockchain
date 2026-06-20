"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Check,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  QrCode,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Truck,
  UserCheck,
  UserCog,
} from "lucide-react";
import { clearSession, getStoredUser, SESSION_UPDATED_EVENT, type DemoUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { parseVaxiTrustQr, verifyHrefFromQr } from "@/lib/qr";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { LanguageFlag } from "@/components/ui/LanguageFlag";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const menuItems = [
  { title: "Tổng quan", href: "/dashboard", icon: LayoutDashboard },
  { title: "Sản phẩm và lô", href: "/dashboard/products", icon: ClipboardList },
  { title: "Chuyển giao", href: "/dashboard/transfers", icon: Truck },
  { title: "Rủi ro & tranh chấp", href: "/dashboard/risk-dispute", icon: ShieldAlert },
  { title: "Thu hồi", href: "/dashboard/recall", icon: RotateCcw },
];

const themeOptions = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
] as const;

const languageOptions = [
  { value: "en", label: "EN" },
  { value: "vi", label: "VI" },
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
  const [lookupValue, setLookupValue] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<DemoUser | null>(() => (typeof window === "undefined" ? null : getStoredUser()));
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener(SESSION_UPDATED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [settingsOpen]);

  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href));

  const logout = () => {
    clearSession();
    onNavigate?.();
    router.push("/login");
  };

  const goLookup = () => {
    const parsed = parseVaxiTrustQr(lookupValue);
    if (!parsed.valid) {
      setLookupError(parsed.reason);
      return;
    }

    setLookupError(null);
    onNavigate?.();
    router.push(verifyHrefFromQr(parsed, "consumer", { returnTo: "dashboard" }));
    setLookupValue("");
  };

  const visibleMenuItems = menuItems.filter((item) => {
    const role = user?.role;
    if (item.href === "/dashboard/recall") return role === "RECALL_AUTHORITY" || role === "ADMIN";
    return true;
  });
  const extraMenuItems = [
    ...(user?.role === "PUBLIC" ? [{ title: "Yêu cầu role", href: "/dashboard/role-request", icon: UserCheck }] : []),
    ...(user?.role === "ADMIN" || user?.roles?.includes("ADMIN") ? [{ title: "Duyệt role", href: "/dashboard/admin/roles", icon: UserCog }] : []),
    ...(user?.role === "RECALL_AUTHORITY" || user?.roles?.includes("RECALL_AUTHORITY") ? [{ title: "Duyệt role", href: "/dashboard/admin/roles", icon: UserCog }] : []),
  ];
  const selectedTheme = mounted ? theme || "system" : "system";

  return (
    <aside className={`${mobile ? "flex h-full w-72" : "hidden h-screen w-64 shrink-0 lg:flex"} min-h-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950`}>
      <Link href="/dashboard" onClick={onNavigate} className="flex min-h-16 items-center border-b border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-950">
        <VaxiTrustLogo className="h-12 w-12" iconClassName="h-7 w-7" showWordmark wordmarkClassName="text-2xl text-white" />
      </Link>

      {user ? (
        <div className="px-4 pt-4">
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${roleColor[user.role] ?? roleColor.PUBLIC}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {translateRole(user.role, language)}
            <span className="ml-auto font-mono text-[10px] opacity-60">{user.address.slice(0, 6)}...{user.address.slice(-4)}</span>
          </div>
        </div>
      ) : null}

      <div className="mx-3 mt-4 rounded-xl border border-blue-200 bg-blue-50/80 p-3 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-200">{t("Quét / Tra cứu")}</p>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              router.push("/dashboard/scan");
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            aria-label={t("Quét QR")}
            title={t("Quét QR")}
          >
            <QrCode className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1.5">
          <input
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-2 font-mono text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-500/20"
            value={lookupValue}
            onChange={(event) => {
              setLookupValue(event.target.value);
              setLookupError(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && goLookup()}
            placeholder="VCN-DEMO-001"
          />
          <button
            onClick={goLookup}
            disabled={!lookupValue.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            aria-label={t("Tra cứu")}
            type="button"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
        {lookupError ? <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-200">{lookupError}</p> : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pt-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active ? "bg-blue-600/15 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-blue-400" : "text-zinc-500"}`} />
              {t(item.title)}
            </Link>
          );
        })}
        {extraMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active ? "bg-blue-600/15 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-blue-400" : "text-zinc-500"}`} />
              {t(item.title)}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <a className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-blue-400" href="mailto:support@vaxitrust.local">
          <HelpCircle className="h-4 w-4" />
          {t("Hỗ trợ")}
        </a>
        <button onClick={logout} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-red-400">
          <LogOut className="h-4 w-4" />
          {t("Đăng xuất")}
        </button>

        <div ref={settingsRef} className="relative">
          <button
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            onClick={() => setSettingsOpen((current) => !current)}
            type="button"
          >
            <Settings className="h-4 w-4" />
            {t("Cài đặt")}
          </button>
          {settingsOpen ? (
            <div className="absolute bottom-0 left-full z-50 ml-2 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Giao diện")}</p>
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const selected = selectedTheme === option.value;
                return (
                  <button key={option.value} className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm ${selected ? "bg-blue-600/15 text-blue-400" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`} onClick={() => setTheme(option.value)} type="button">
                    <Icon className="h-4 w-4" />
                    {t(option.label)}
                    {selected ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
                  </button>
                );
              })}
              <p className="px-2 pb-2 pt-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Ngôn ngữ")}</p>
              <div className="grid grid-cols-2 gap-2">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value)}
                    className={`flex h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold ${language === option.value ? "border-blue-500 bg-blue-600/15 text-blue-700 dark:text-blue-100" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"}`}
                  >
                    {language === option.value ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
                    <LanguageFlag language={option.value} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

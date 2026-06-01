"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useAccount, useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi";
import { useTheme } from "next-themes";
import {
  Building2,
  Camera,
  Check,
  Factory,
  Hospital,
  Keyboard,
  Languages,
  Link2,
  Monitor,
  Moon,
  Pill,
  RotateCcw,
  ShieldCheck,
  Ship,
  Sun,
  Truck,
  UserCheck,
  UserCog,
} from "lucide-react";
import { getApiErrorMessage, getDemoActors, loginWithSignature, requestAuthNonce } from "@/lib/api";
import { demoActors as fallbackActors, loginDemo, setSession } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { ContactFooter } from "@/components/layout/ContactFooter";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

type ActiveTab = "login" | "verify";
type VerifyMode = "manual" | "camera";

const roleIcon: Record<string, React.ElementType> = {
  MANUFACTURER: Factory,
  IMPORTER: Ship,
  DISTRIBUTOR: Truck,
  CLINIC: Hospital,
  PHARMACY: Pill,
  RECALL_AUTHORITY: RotateCcw,
  ADMIN: UserCog,
  PUBLIC: UserCheck,
};

const themeOptions = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
] as const;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function PreferenceControls() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-lg border border-zinc-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const selected = (theme || "light") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
                selected ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
              title={t(option.label)}
              aria-label={t(option.label)}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className="flex rounded-lg border border-zinc-200 bg-white/80 p-1 text-xs font-bold shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <Languages className="mx-2 my-auto h-4 w-4 text-zinc-400" />
        {(["vi", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLanguage(item)}
            className={`flex h-9 min-w-10 items-center justify-center gap-1 rounded-md px-2 transition ${
              language === item ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {language === item ? <Check className="h-3 w-3" /> : null}
            {item.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { mutateAsync: connectAsync } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { language } = useLanguage();
  const t = useTranslation();

  const [activeTab, setActiveTab] = useState<ActiveTab>("login");
  const [actors, setActors] = useState(fallbackActors);
  const [selectedRole, setSelectedRole] = useState(fallbackActors[0]?.role || "MANUFACTURER");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("manual");
  const [serialId, setSerialId] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    getDemoActors()
      .then((items) => {
        if (items.length > 0) {
          setActors(items);
          setSelectedRole(items[0].role);
        }
      })
      .catch(() => setActors(fallbackActors));
  }, []);

  const selectedActor = useMemo(() => actors.find((actor) => actor.role === selectedRole) ?? actors[0], [actors, selectedRole]);

  async function connectWithMetaMask() {
    const metaMaskConnector = connectors.find((connector) => connector.id.toLowerCase().includes("metamask"));
    if (!metaMaskConnector) throw new Error(t("Không tìm thấy MetaMask."));
    if (isConnected) {
      disconnect();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    const result = await connectAsync({ connector: metaMaskConnector });
    return result.accounts[0];
  }

  async function handleMetaMask() {
    setError(null);
    setIsLoading(true);
    try {
      const walletAddress = await connectWithMetaMask();
      const nonce = await requestAuthNonce(walletAddress);
      if (!nonce?.message) throw new Error(t("Backend không trả về nội dung ký MetaMask."));
      const signature = await signMessageAsync({ message: nonce.message });
      const { token, user } = await loginWithSignature({ address: walletAddress, signature });
      setSession(token, user, "wallet");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, err instanceof Error ? err.message : t("Đăng nhập MetaMask thất bại.")));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoLogin() {
    if (!selectedActor) {
      setError(t("Chưa có ví demo nào được cấu hình trong backend."));
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await loginDemo(selectedActor);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("Đăng nhập demo thất bại.")));
    } finally {
      setIsLoading(false);
    }
  }

  function goVerify(value = serialId) {
    const trimmed = value.trim();
    if (trimmed) router.push(`/consumer/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0,#f8fafc_34%,#f8fafc_100%)] px-5 py-5 text-zinc-950 dark:bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.1)_0,rgba(15,23,42,0.88)_32%,#09090b_100%)] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-11rem)] w-full max-w-5xl flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <VaxiTrustLogo className="h-12 w-12" iconClassName="h-7 w-7" showWordmark wordmarkClassName="text-2xl" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PreferenceControls />
            {address ? <span className="rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 font-mono text-xs text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400">{shortAddress(address)}</span> : null}
          </div>
        </header>

        <section className="mx-auto mt-7 w-full max-w-xl rounded-xl border border-zinc-200 bg-white/92 p-5 shadow-2xl shadow-blue-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-950">
            {(["login", "verify"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setError(null);
                }}
                className={`min-h-10 rounded-md text-sm font-bold transition ${activeTab === tab ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}
              >
                {tab === "login" ? t("Đăng nhập") : t("Xác minh nguồn gốc")}
              </button>
            ))}
          </div>

          {activeTab === "login" ? (
            <div className="mt-5 space-y-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold">{t("Đăng nhập hệ thống")}</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("Chọn ví demo hoặc đăng nhập trực tiếp bằng MetaMask.")}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {actors.map((actor) => {
                  const Icon = roleIcon[actor.role] || Building2;
                  return (
                    <button
                      key={`${actor.role}-${actor.address}`}
                      type="button"
                      onClick={() => setSelectedRole(actor.role)}
                      className={`min-h-[5.5rem] rounded-lg border p-3 text-center transition ${
                        selectedRole === actor.role
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-100"
                          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      <Icon className="mx-auto h-5 w-5" />
                      <span className="mt-2 block text-sm font-bold">{translateRole(actor.role, language) || actor.label || actor.role}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">{selectedActor?.address || t("Chưa có ví demo")}</div>

              {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</p> : null}

              <button type="button" onClick={handleDemoLogin} disabled={isLoading || !selectedActor} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isLoading ? t("Đang đăng nhập...") : t("Đăng nhập bằng ví demo")}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={handleMetaMask} disabled={isLoading} className="flex min-h-12 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800">
                  MetaMask
                </button>
                <button type="button" disabled className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
                  <Link2 className="h-4 w-4" />
                  WalletConnect
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold">{t("Xác minh nguồn gốc")}</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("Quét QR hoặc nhập serial để xem nguồn gốc và lịch sử chuyển giao.")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-950">
                <button type="button" onClick={() => setVerifyMode("manual")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "manual" ? "bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-white" : "text-zinc-500"}`}>
                  <Keyboard className="h-4 w-4" />
                  {t("Nhập serial")}
                </button>
                <button type="button" onClick={() => setVerifyMode("camera")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "camera" ? "bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-white" : "text-zinc-500"}`}>
                  <Camera className="h-4 w-4" />
                  {t("Quét QR")}
                </button>
              </div>
              {verifyMode === "manual" ? (
                <div className="flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" value={serialId} onChange={(event) => setSerialId(event.target.value)} onKeyDown={(event) => event.key === "Enter" && goVerify()} placeholder="VCN-DEMO-001" />
                  <button type="button" onClick={() => goVerify()} disabled={!serialId.trim()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                    <ShieldCheck className="h-4 w-4" />
                    {t("Xác minh")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-zinc-700">
                    <Scanner
                      onScan={(detectedCodes) => {
                        const value = detectedCodes[0]?.rawValue;
                        if (value) goVerify(value);
                      }}
                      onError={(err) => setScanError(String(err))}
                    />
                  </div>
                  {scanError ? <p className="text-xs text-red-300">{scanError}</p> : <p className="text-xs text-zinc-500">{t("Hướng camera vào mã QR trên vaccine.")}</p>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <ContactFooter animatedBackdrop className="-mx-5 mt-8 rounded-none border-x-0 border-b-0 px-5 sm:px-8" />
    </main>
  );
}

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
import { getApiErrorMessage, getDemoActors, getHealth, loginWithSignature, requestAuthNonce } from "@/lib/api";
import { demoActors as fallbackActors, loginDemo, setSession } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { parseVaxiTrustQr, verifyHrefFromQr } from "@/lib/qr";
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

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type MetaMaskDiagnostic = {
  step: string;
  detail?: string;
  status: "pending" | "ok" | "error";
};

function getInjectedEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

function PreferenceControls() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTheme = mounted ? theme || "system" : "system";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-lg border border-zinc-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const selected = selectedTheme === option.value;
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

function LoginTechBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style jsx>{`
        @keyframes loginFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)); opacity: 0.18; }
          50% { transform: translate3d(var(--x), var(--y), 0) rotate(calc(var(--rotate) + 9deg)); opacity: 0.34; }
        }
        @keyframes loginPulse {
          0%, 100% { transform: scale(0.96); opacity: 0.08; }
          50% { transform: scale(1.08); opacity: 0.18; }
        }
        @keyframes loginScan {
          0% { transform: translateX(-15%); opacity: 0; }
          20%, 72% { opacity: 0.42; }
          100% { transform: translateX(115%); opacity: 0; }
        }
        .login-float { animation: loginFloat 10s ease-in-out infinite; }
        .login-pulse { animation: loginPulse 6s ease-in-out infinite; }
        .login-scan { animation: loginScan 8s ease-in-out infinite; }
      `}</style>

      <div className="absolute -left-20 top-16 h-80 w-80 rounded-full border border-blue-200/60 bg-[radial-gradient(circle,rgba(147,197,253,0.34),transparent_64%)] blur-[1px] dark:border-cyan-300/10 dark:bg-[radial-gradient(circle,rgba(56,189,248,0.12),transparent_62%)]" />
      <div className="absolute right-[-7rem] top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18),transparent_62%)] dark:bg-[radial-gradient(circle,rgba(37,99,235,0.10),transparent_62%)]" />
      <div className="login-scan absolute left-0 top-[22%] h-px w-3/4 bg-gradient-to-r from-transparent via-blue-400/45 to-transparent dark:via-cyan-300/35" />
      <div className="login-pulse absolute -left-8 bottom-28 h-32 w-32 text-emerald-200/80 dark:text-emerald-300/35">
        <div className="absolute left-1/2 top-0 h-full w-7 -translate-x-1/2 rounded-full bg-current" />
        <div className="absolute left-0 top-1/2 h-7 w-full -translate-y-1/2 rounded-full bg-current" />
      </div>
      <div
        className="login-float absolute bottom-[18%] left-[8%] h-32 w-14 rounded-full border border-emerald-200/70 bg-emerald-100/70 shadow-[inset_8px_8px_18px_rgba(255,255,255,0.68),0_18px_45px_rgba(16,185,129,0.18)] dark:border-emerald-300/15 dark:bg-emerald-300/10"
        style={{ "--rotate": "18deg", "--x": "18px", "--y": "-14px" } as React.CSSProperties}
      >
        <div className="absolute left-1/2 top-3 h-5 w-8 -translate-x-1/2 rounded-md bg-white/80 dark:bg-white/15" />
        <div className="absolute left-1/2 top-14 h-12 w-7 -translate-x-1/2 rounded-full bg-cyan-300/55 dark:bg-cyan-300/25" />
      </div>
      <div
        className="login-float absolute right-[9%] top-[20%] h-32 w-8 rounded-full bg-blue-300/30 shadow-[0_0_28px_rgba(59,130,246,0.30)] dark:bg-blue-300/20"
        style={{ "--rotate": "-24deg", "--x": "-18px", "--y": "10px", animationDelay: "1.2s" } as React.CSSProperties}
      >
        <div className="absolute -bottom-8 left-1/2 h-10 w-1 -translate-x-1/2 rounded-full bg-blue-300/45" />
        <div className="absolute -top-3 left-1/2 h-4 w-12 -translate-x-1/2 rounded-full border border-blue-300/40 bg-white/30 dark:bg-transparent" />
      </div>
      <div className="login-float absolute bottom-[10%] right-[12%] hidden h-28 w-28 rounded-[2rem] border border-blue-200/60 bg-white/45 shadow-[0_20px_60px_rgba(37,99,235,0.12)] backdrop-blur-sm dark:border-blue-400/10 dark:bg-white/[0.03] sm:block" style={{ "--rotate": "8deg", "--x": "-12px", "--y": "12px", animationDelay: "0.6s" } as React.CSSProperties}>
        <div className="absolute left-6 top-8 h-px w-16 bg-blue-400/30" />
        <div className="absolute left-6 top-14 h-px w-20 bg-emerald-400/25" />
        <div className="absolute bottom-6 right-6 h-9 w-9 rounded-full border border-blue-400/25" />
      </div>
      <div className="absolute bottom-10 right-10 hidden grid-cols-6 gap-2 opacity-20 dark:opacity-15 sm:grid">
        {Array.from({ length: 24 }).map((_, index) => (
          <span key={index} className="h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-cyan-300" />
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

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === "undefined") return "login";
    return new URLSearchParams(window.location.search).get("scan") === "1" ? "verify" : "login";
  });
  const [actors, setActors] = useState(fallbackActors);
  const [selectedRole, setSelectedRole] = useState(fallbackActors[0]?.role || "MANUFACTURER");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaMaskDiagnostics, setMetaMaskDiagnostics] = useState<MetaMaskDiagnostic[]>([]);
  const [verifyMode, setVerifyMode] = useState<VerifyMode>(() => {
    if (typeof window === "undefined") return "manual";
    return new URLSearchParams(window.location.search).get("scan") === "1" ? "camera" : "manual";
  });
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

  function addMetaMaskDiagnostic(step: string, status: MetaMaskDiagnostic["status"], detail?: string) {
    const message = detail ? `${step}: ${detail}` : step;
    if (status === "error") {
      console.error(`[MetaMask login] ${message}`);
    } else {
      console.info(`[MetaMask login] ${message}`);
    }
    setMetaMaskDiagnostics((items) => [...items, { step, detail, status }]);
  }

  async function connectWithMetaMask() {
    const metaMaskConnector = connectors.find((connector) => connector.id.toLowerCase().includes("metamask"));
    const injectedEthereum = getInjectedEthereum();
    addMetaMaskDiagnostic(
      "Kiểm tra extension",
      metaMaskConnector || injectedEthereum ? "ok" : "error",
      `wagmi=${Boolean(metaMaskConnector)}, injected=${Boolean(injectedEthereum)}`
    );
    if (!metaMaskConnector && !injectedEthereum) throw new Error("MetaMask extension was not found.");
    if (isConnected) {
      addMetaMaskDiagnostic("Ngắt kết nối cũ", "pending");
      disconnect();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      addMetaMaskDiagnostic("Ngắt kết nối cũ", "ok");
    }

    if (metaMaskConnector) {
      try {
        addMetaMaskDiagnostic("Kết nối bằng wagmi connector", "pending");
        const result = await connectAsync({ connector: metaMaskConnector });
        const account = result.accounts[0];
        if (account) {
          addMetaMaskDiagnostic("Kết nối bằng wagmi connector", "ok", account);
          return account;
        }
      } catch (err) {
        addMetaMaskDiagnostic("Kết nối bằng wagmi connector", "error", err instanceof Error ? err.message : String(err));
        if (!injectedEthereum) throw err;
      }
    }

    if (!injectedEthereum) throw new Error("MetaMask extension was not found.");
    addMetaMaskDiagnostic("Fallback window.ethereum", "pending");
    const accounts = await injectedEthereum.request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? String(accounts[0] || "") : "";
    if (!account) throw new Error("MetaMask did not return a wallet address.");
    addMetaMaskDiagnostic("Fallback window.ethereum", "ok", account);
    return account;
  }

  async function signMetaMaskMessage(walletAddress: string, message: string) {
    try {
      addMetaMaskDiagnostic("Ký bằng wagmi", "pending");
      const signature = await signMessageAsync({ message });
      addMetaMaskDiagnostic("Ký bằng wagmi", "ok");
      return signature;
    } catch (err) {
      addMetaMaskDiagnostic("Ký bằng wagmi", "error", err instanceof Error ? err.message : String(err));
    }

    const injectedEthereum = getInjectedEthereum();
    if (!injectedEthereum) throw new Error("MetaMask extension was not found for signing.");

    try {
      addMetaMaskDiagnostic("Fallback personal_sign", "pending");
      const signature = await injectedEthereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });
      if (typeof signature !== "string" || !signature) throw new Error("MetaMask did not return a signature.");
      addMetaMaskDiagnostic("Fallback personal_sign", "ok");
      return signature;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      addMetaMaskDiagnostic("Fallback personal_sign", "error", detail);
      throw new Error(detail || "MetaMask signature was rejected or failed.");
    }
  }

  async function handleMetaMask() {
    setError(null);
    setMetaMaskDiagnostics([]);
    setIsLoading(true);
    try {
      addMetaMaskDiagnostic("Bắt đầu đăng nhập MetaMask", "pending");
      const walletAddress = await connectWithMetaMask();
      addMetaMaskDiagnostic("Ví đã kết nối", "ok", walletAddress);
      try {
        addMetaMaskDiagnostic("Kiểm tra backend /health", "pending");
        await getHealth();
        addMetaMaskDiagnostic("Kiểm tra backend /health", "ok");
      } catch {
        addMetaMaskDiagnostic("Kiểm tra backend /health", "error");
        throw new Error("Backend is not reachable. Check NEXT_PUBLIC_API_URL or backend deployment.");
      }
      addMetaMaskDiagnostic("Lấy nonce từ backend", "pending");
      const nonce = await requestAuthNonce(walletAddress);
      if (!nonce?.message) throw new Error("Backend did not return a MetaMask signing message.");
      addMetaMaskDiagnostic("Lấy nonce từ backend", "ok");
      addMetaMaskDiagnostic("Yêu cầu ký message", "pending");
      const signature = await signMetaMaskMessage(walletAddress, nonce.message);
      addMetaMaskDiagnostic("Yêu cầu ký message", "ok");
      addMetaMaskDiagnostic("Xác thực chữ ký với backend", "pending");
      const { token, user } = await loginWithSignature({ address: walletAddress, signature });
      addMetaMaskDiagnostic("Xác thực chữ ký với backend", "ok", user.role);
      setSession(token, user, "wallet");
      router.push(user.role === "PUBLIC" ? "/dashboard/role-request" : "/dashboard");
    } catch (err: unknown) {
      addMetaMaskDiagnostic("Đăng nhập MetaMask thất bại", "error", err instanceof Error ? err.message : String(err));
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
    const parsed = parseVaxiTrustQr(value);
    if (!parsed.valid) {
      setScanError(parsed.reason);
      return;
    }
    setScanError(null);
    router.push(verifyHrefFromQr(parsed, "consumer"));
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_42%,#ffffff_100%)] px-4 py-4 text-zinc-950 dark:bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.1)_0,rgba(15,23,42,0.88)_32%,#09090b_100%)] dark:text-white sm:px-5 sm:py-5">
      <LoginTechBackdrop />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-11rem)] w-full max-w-5xl flex-1 flex-col">
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <VaxiTrustLogo className="h-12 w-12" iconClassName="h-7 w-7" showWordmark wordmarkClassName="text-2xl" />
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <PreferenceControls />
            {address ? <span className="rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 font-mono text-xs text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400">{shortAddress(address)}</span> : null}
          </div>
        </header>

        <section className="mx-auto mt-5 w-full max-w-xl rounded-xl border border-blue-100 bg-white/95 p-4 shadow-[0_24px_80px_rgba(37,99,235,0.12)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20 sm:mt-7 sm:p-5">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-1 dark:border-zinc-800 dark:bg-zinc-950">
            {(["login", "verify"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setError(null);
                }}
                className={`min-h-10 rounded-md text-sm font-bold transition ${activeTab === tab ? "bg-blue-600 text-white shadow-sm" : "text-zinc-500 hover:bg-white/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-transparent dark:hover:text-white"}`}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {actors.map((actor) => {
                  const Icon = roleIcon[actor.role] || Building2;
                  return (
                    <button
                      key={`${actor.role}-${actor.address}`}
                      type="button"
                      onClick={() => setSelectedRole(actor.role)}
                      className={`min-h-[5.5rem] rounded-lg border p-3 text-center transition ${
                        selectedRole === actor.role
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100 dark:bg-blue-500/15 dark:text-blue-100 dark:shadow-none"
                          : "border-zinc-200 bg-white text-zinc-500 shadow-sm hover:border-blue-200 hover:bg-blue-50/50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:shadow-none dark:hover:border-zinc-600 dark:hover:bg-zinc-950"
                      }`}
                    >
                      <Icon className="mx-auto h-5 w-5" />
                      <span className="mt-2 block text-sm font-bold">{translateRole(actor.role, language) || actor.label || actor.role}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">{selectedActor?.address || t("Chưa có ví demo")}</div>

              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</p> : null}

              {metaMaskDiagnostics.length > 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  <p className="mb-1 font-bold text-zinc-800 dark:text-zinc-100">{t("Chẩn đoán MetaMask")}</p>
                  <ul className="space-y-1">
                    {metaMaskDiagnostics.map((item, index) => (
                      <li key={`${item.step}-${index}`} className="flex gap-2">
                        <span className={item.status === "ok" ? "text-emerald-600 dark:text-emerald-300" : item.status === "error" ? "text-red-600 dark:text-red-300" : "text-blue-600 dark:text-blue-300"}>
                          {item.status === "ok" ? "OK" : item.status === "error" ? "ERR" : "..."}
                        </span>
                        <span>
                          {item.step}
                          {item.detail ? <span className="break-all text-zinc-500 dark:text-zinc-400"> - {item.detail}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button type="button" onClick={handleDemoLogin} disabled={isLoading || !selectedActor} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isLoading ? t("Đang đăng nhập...") : t("Đăng nhập bằng ví demo")}
              </button>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-1 dark:border-zinc-800 dark:bg-zinc-950">
                <button type="button" onClick={() => setVerifyMode("manual")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "manual" ? "bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500"}`}>
                  <Keyboard className="h-4 w-4" />
                  {t("Nhập serial")}
                </button>
                <button type="button" onClick={() => setVerifyMode("camera")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "camera" ? "bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500"}`}>
                  <Camera className="h-4 w-4" />
                  {t("Quét QR")}
                </button>
              </div>
              {verifyMode === "manual" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
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
                  {scanError ? <p className="text-xs text-red-600 dark:text-red-300">{scanError}</p> : <p className="text-xs text-zinc-500">{t("Hướng camera vào mã QR trên vaccine.")}</p>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <ContactFooter animatedBackdrop className="relative z-10 -mx-4 mt-8 rounded-none border-x-0 border-b-0 px-4 sm:-mx-5 sm:px-8" />
    </main>
  );
}

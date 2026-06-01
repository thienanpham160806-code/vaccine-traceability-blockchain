"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useAccount, useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi";
import { Camera, Keyboard, Link2, Lock, ShieldCheck } from "lucide-react";
import { getApiErrorMessage, getDemoActors, loginWithSignature, requestAuthNonce } from "@/lib/api";
import { demoActors as fallbackActors, loginDemo, setSession } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { ContactFooter } from "@/components/layout/ContactFooter";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

type ActiveTab = "login" | "verify";
type VerifyMode = "manual" | "camera";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
    <main className="flex min-h-screen flex-col bg-zinc-950 px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <header className="flex items-center justify-between">
          <VaxiTrustLogo className="h-12 w-12" iconClassName="h-7 w-7" showWordmark wordmarkClassName="text-2xl" />
          {address ? <span className="rounded-lg border border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-400">{shortAddress(address)}</span> : null}
        </header>

        <section className="mx-auto mt-10 w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            {(["login", "verify"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setError(null);
                }}
                className={`min-h-11 rounded-md text-sm font-bold transition ${activeTab === tab ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}
              >
                {tab === "login" ? t("Đăng nhập") : t("Xác minh nguồn gốc")}
              </button>
            ))}
          </div>

          {activeTab === "login" ? (
            <div className="mt-6 space-y-5">
              <div className="text-center">
                <h1 className="text-2xl font-bold">{t("Đăng nhập hệ thống")}</h1>
                <p className="mt-1 text-sm text-zinc-400">{t("Chọn ví demo hoặc đăng nhập trực tiếp bằng MetaMask.")}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {actors.map((actor) => (
                  <button
                    key={`${actor.role}-${actor.address}`}
                    type="button"
                    onClick={() => setSelectedRole(actor.role)}
                    className={`min-h-24 rounded-lg border p-3 text-center transition ${selectedRole === actor.role ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <Lock className="mx-auto h-5 w-5" />
                    <span className="mt-2 block text-sm font-bold">{translateRole(actor.role, language) || actor.label || actor.role}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-zinc-400">{selectedActor?.address || t("Chưa có ví demo")}</div>

              {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</p> : null}

              <button type="button" onClick={handleDemoLogin} disabled={isLoading || !selectedActor} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isLoading ? t("Đang đăng nhập...") : t("Đăng nhập bằng ví demo")}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={handleMetaMask} disabled={isLoading} className="flex min-h-12 items-center justify-center rounded-lg border border-zinc-700 text-sm font-bold text-zinc-100 hover:bg-zinc-800 disabled:opacity-50">
                  MetaMask
                </button>
                <button type="button" disabled className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-800 text-sm font-bold text-zinc-500">
                  <Link2 className="h-4 w-4" />
                  WalletConnect
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="text-center">
                <h1 className="text-2xl font-bold">{t("Xác minh nguồn gốc")}</h1>
                <p className="mt-1 text-sm text-zinc-400">{t("Quét QR hoặc nhập serial để xem nguồn gốc và lịch sử chuyển giao.")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button type="button" onClick={() => setVerifyMode("manual")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "manual" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}>
                  <Keyboard className="h-4 w-4" />
                  {t("Nhập serial")}
                </button>
                <button type="button" onClick={() => setVerifyMode("camera")} className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold ${verifyMode === "camera" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}>
                  <Camera className="h-4 w-4" />
                  {t("Quét QR")}
                </button>
              </div>
              {verifyMode === "manual" ? (
                <div className="flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-blue-500" value={serialId} onChange={(event) => setSerialId(event.target.value)} onKeyDown={(event) => event.key === "Enter" && goVerify()} placeholder="VCN-DEMO-001" />
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
      <ContactFooter className="mx-auto mt-10 w-full max-w-5xl" />
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi";
import { Activity, Building2, Link2, Lock, Shield, Stethoscope, Truck, UserCheck } from "lucide-react";
import { getApiErrorMessage, getDemoActors, loginWithSignature, requestAuthNonce } from "@/lib/api";
import { demoActors as fallbackActors, loginDemo, setSession } from "@/lib/auth";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { translateRole } from "@/lib/i18n";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { ContactFooter } from "@/components/layout/ContactFooter";

const roleIcon: Record<string, React.ElementType> = {
  MANUFACTURER: Building2,
  IMPORTER: Building2,
  DISTRIBUTOR: Truck,
  CLINIC: Stethoscope,
  PHARMACY: UserCheck,
};

const roleLabel: Record<string, string> = {
  MANUFACTURER: "Nhà sản xuất",
  IMPORTER: "Nhà nhập khẩu",
  DISTRIBUTOR: "Nhà phân phối",
  CLINIC: "Phòng khám",
  PHARMACY: "Nhà thuốc",
  PUBLIC: "Người dùng",
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function InfoRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{text}</span>
    </div>
  );
}

function MedicalBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style jsx>{`
        @keyframes floatSlow {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)); }
          50% { transform: translate3d(var(--move-x), var(--move-y), 0) rotate(calc(var(--rotate) + 7deg)); }
        }
        @keyframes pulseCross {
          0%, 100% { opacity: 0.1; transform: scale(0.94); }
          50% { opacity: 0.26; transform: scale(1.08); }
        }
        .float-med { animation: floatSlow 8s ease-in-out infinite; }
        .float-med-delay { animation: floatSlow 10s ease-in-out 1.2s infinite; }
        .pulse-cross { animation: pulseCross 4.5s ease-in-out infinite; }
      `}</style>

      <div className="pulse-cross absolute -left-12 bottom-8 h-40 w-40 text-emerald-300/35">
        <div className="absolute left-1/2 top-0 h-full w-10 -translate-x-1/2 rounded-full bg-current" />
        <div className="absolute left-0 top-1/2 h-10 w-full -translate-y-1/2 rounded-full bg-current" />
      </div>
      <div className="pulse-cross absolute right-[28%] top-20 h-24 w-24 text-cyan-300/30 [animation-delay:1.4s]">
        <div className="absolute left-1/2 top-0 h-full w-6 -translate-x-1/2 rounded-full bg-current" />
        <div className="absolute left-0 top-1/2 h-6 w-full -translate-y-1/2 rounded-full bg-current" />
      </div>
      <div className="pulse-cross absolute bottom-16 right-8 h-32 w-32 text-emerald-400/25 [animation-delay:2.1s]">
        <div className="absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 rounded-full bg-current" />
        <div className="absolute left-0 top-1/2 h-8 w-full -translate-y-1/2 rounded-full bg-current" />
      </div>

      <div
        className="float-med absolute left-[4%] top-[15%] hidden h-52 w-20 rounded-full border border-blue-200/80 bg-gradient-to-br from-white via-sky-50 to-blue-100/90 shadow-[18px_24px_45px_rgba(37,99,235,0.18),inset_-10px_-12px_22px_rgba(37,99,235,0.12),inset_8px_8px_18px_rgba(255,255,255,0.95)] md:block"
        style={{ "--rotate": "-18deg", "--move-x": "18px", "--move-y": "-16px" } as React.CSSProperties}
      >
        <div className="absolute left-1/2 top-3 h-7 w-11 -translate-x-1/2 rounded-lg border border-blue-200 bg-white shadow-inner" />
        <div className="absolute left-1/2 top-14 h-28 w-11 -translate-x-1/2 rounded-full border border-blue-200 bg-gradient-to-b from-sky-100 via-blue-200 to-cyan-200 shadow-inner" />
        <div className="absolute left-5 top-20 h-14 w-2 rounded-full bg-white/70 blur-[1px]" />
        <div className="absolute left-1/2 bottom-8 h-11 w-12 -translate-x-1/2 rounded-full border border-blue-200 bg-white/90 shadow-inner" />
        <div className="absolute left-1/2 -bottom-8 h-12 w-2 -translate-x-1/2 rounded-full bg-gradient-to-b from-zinc-200 to-zinc-400" />
        <div className="absolute left-1/2 -bottom-14 h-8 w-px -translate-x-1/2 bg-zinc-500" />
      </div>

      <div
        className="float-med-delay absolute bottom-[9%] left-[10%] hidden h-36 w-14 rounded-full border border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50 to-cyan-100 shadow-[14px_20px_38px_rgba(16,185,129,0.16),inset_-8px_-10px_18px_rgba(6,182,212,0.12),inset_8px_8px_18px_rgba(255,255,255,0.92)] lg:block"
        style={{ "--rotate": "14deg", "--move-x": "-14px", "--move-y": "12px" } as React.CSSProperties}
      >
        <div className="absolute left-1/2 -top-6 h-8 w-8 -translate-x-1/2 rounded-lg border border-emerald-200 bg-white" />
        <div className="absolute left-1/2 top-8 h-20 w-8 -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-100 to-cyan-200 shadow-inner" />
        <div className="absolute left-4 top-12 h-10 w-1.5 rounded-full bg-white/70 blur-[1px]" />
      </div>

      <div
        className="float-med-delay absolute bottom-[14%] left-[38%] hidden h-4 w-64 rounded-full bg-gradient-to-r from-zinc-300 via-white to-blue-100 shadow-[14px_18px_34px_rgba(37,99,235,0.16),inset_0_3px_8px_rgba(255,255,255,0.9),inset_0_-3px_8px_rgba(71,85,105,0.16)] lg:block"
        style={{ "--rotate": "22deg", "--move-x": "-18px", "--move-y": "12px" } as React.CSSProperties}
      >
        <div className="absolute -left-12 top-1/2 h-12 w-16 -translate-y-1/2 rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-100 shadow-inner" />
        <div className="absolute left-6 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-blue-200/70" />
        <div className="absolute left-16 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-blue-200/70" />
        <div className="absolute left-26 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-blue-200/70" />
        <div className="absolute -right-24 top-1/2 h-px w-24 -translate-y-1/2 bg-zinc-500" />
        <div className="absolute -right-29 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-zinc-500" />
      </div>

      <div
        className="float-med absolute right-[10%] top-[16%] hidden h-3 w-44 rounded-full bg-gradient-to-r from-cyan-100 via-white to-zinc-300 shadow-[10px_14px_28px_rgba(6,182,212,0.14)] xl:block"
        style={{ "--rotate": "-28deg", "--move-x": "10px", "--move-y": "18px" } as React.CSSProperties}
      >
        <div className="absolute -left-8 top-1/2 h-8 w-10 -translate-y-1/2 rounded-md border border-cyan-100 bg-white/90" />
        <div className="absolute -right-16 top-1/2 h-px w-16 -translate-y-1/2 bg-zinc-400" />
        <div className="absolute -right-19 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-zinc-400" />
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

  const [actors, setActors] = useState(fallbackActors);
  const [selectedRole, setSelectedRole] = useState(fallbackActors[0]?.role || "MANUFACTURER");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemoActors()
      .then((items) => {
        if (items.length > 0) {
          setActors(items);
          setSelectedRole(items[0].role);
        }
      })
      .catch(() => {
        setActors(fallbackActors);
      });
  }, []);

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.role === selectedRole) ?? actors[0],
    [actors, selectedRole]
  );

  async function connectWithMetaMask() {
    const metaMaskConnector = connectors.find((connector) => connector.id.toLowerCase().includes("metamask"));
    if (!metaMaskConnector) {
      throw new Error("Không tìm thấy MetaMask. Hãy bật extension MetaMask và tải lại trang.");
    }

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
      if (!nonce?.message) throw new Error("Backend không trả về nội dung ký MetaMask.");
      const signature = await signMessageAsync({ message: nonce.message });
      const { token, user } = await loginWithSignature({ address: walletAddress, signature });
      setSession(token, user, "wallet");
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("User rejected")) {
        setError("Bạn đã hủy thao tác trên MetaMask.");
      } else {
        setError(getApiErrorMessage(err, err instanceof Error ? err.message : "Đăng nhập MetaMask thất bại."));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoLogin() {
    if (!selectedActor) {
      setError("Chưa có ví demo nào được cấu hình trong backend.");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await loginDemo(selectedActor);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Đăng nhập demo thất bại."));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0,#f8fafc_32%,#f8fafc_100%)] text-zinc-950 dark:bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.1)_0,rgba(15,23,42,0.88)_32%,#09090b_100%)] dark:text-zinc-100">
      <MedicalBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <VaxiTrustLogo
            className="h-12 w-12"
            iconClassName="h-7 w-7"
            showWordmark
            subtitle={language === "en" ? "VACCINE TRACEABILITY" : "TRUY XUẤT VACCINE"}
            subtitleClassName="text-[10px]"
            wordmarkClassName="text-2xl"
          />
        </div>
        {address ? (
          <div className="hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-600 shadow-sm sm:block dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-200">
            {shortAddress(address)}
          </div>
        ) : null}
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-6 px-5 pb-5 pt-2 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:px-8">
        <section className="space-y-7 py-6">
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight text-zinc-950 dark:text-zinc-100 sm:text-5xl">
              {t("Xác thực chuỗi cung ứng vaccine")}
            </h1>
            <p className="max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              {t("Nền tảng quản lý logistics y tế ứng dụng Blockchain để theo dõi lô vaccine, chuyển giao và xác minh công khai.")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <InfoRow icon={Shield} text={t("Phân quyền bằng Smart Contract")} />
            <InfoRow icon={Lock} text={t("Đăng nhập bằng chữ ký MetaMask")} />
            <InfoRow icon={Activity} text={t("Đồng bộ dữ liệu Firebase và IPFS")} />
          </div>
        </section>

        <section className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white/92 p-6 shadow-xl shadow-blue-950/5 backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95 dark:shadow-black/20">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">{t("Đăng nhập hệ thống")}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("Chọn ví demo hoặc đăng nhập trực tiếp bằng MetaMask.")}</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {actors.map((actor) => {
              const Icon = roleIcon[actor.role] || UserCheck;
              return (
                <button
                  key={`${actor.role}-${actor.address}`}
                  type="button"
                  onClick={() => setSelectedRole(actor.role)}
                  className={`min-h-28 rounded-lg border p-4 text-center transition ${
                    selectedRole === actor.role
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/90 dark:text-blue-200"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="mx-auto h-6 w-6" />
                  <span className="mt-2 block text-sm font-bold">
                    {translateRole(actor.role, language) || actor.label || actor.role}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t("Ví demo")}</p>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-300">
              {selectedActor?.address || t("Chưa có ví demo")}
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading || !selectedActor}
            className="mt-5 flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? t("Đang đăng nhập...") : t("Đăng nhập bằng ví demo")}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">{t("HOẶC")}</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleMetaMask}
              disabled={isLoading}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-800 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-blue-400 dark:hover:bg-blue-950"
            >
              MetaMask
            </button>
            <button
              type="button"
              disabled
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-400 opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-500"
            >
              <Link2 className="h-4 w-4" />
              WalletConnect
            </button>
          </div>

          {isConnected && address ? (
            <div className="mt-5 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950/80">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{t("Ví đang kết nối")}</p>
                <p className="mt-1 font-mono text-xs text-blue-700 dark:text-blue-300">{shortAddress(address)}</p>
              </div>
              <button onClick={() => disconnect()} className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                {t("Ngắt kết nối")}
              </button>
            </div>
          ) : null}
        </section>
      </main>
      <ContactFooter className="mt-8 w-full rounded-none border-x-0 border-b-0" />
    </div>
  );
}

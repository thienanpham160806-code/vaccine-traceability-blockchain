"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi";
import { Activity, Building2, Link2, Lock, Shield, Stethoscope, Truck, UserCheck } from "lucide-react";
import { getApiErrorMessage, getDemoActors, loginWithSignature, requestAuthNonce } from "@/lib/api";
import { demoActors as fallbackActors, loginDemo, setSession } from "@/lib/auth";

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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <span className="text-sm font-semibold text-zinc-800">{text}</span>
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
        className="float-med absolute left-[5%] top-[18%] hidden h-44 w-16 rounded-full border border-blue-200/70 bg-white/80 shadow-lg shadow-blue-100/70 md:block"
        style={{ "--rotate": "-18deg", "--move-x": "18px", "--move-y": "-16px" } as React.CSSProperties}
      >
        <div className="absolute left-1/2 top-4 h-24 w-9 -translate-x-1/2 rounded-full border border-blue-200 bg-gradient-to-b from-sky-100 to-blue-200" />
        <div className="absolute left-1/2 bottom-8 h-10 w-10 -translate-x-1/2 rounded-full border border-blue-200 bg-white" />
        <div className="absolute left-1/2 -bottom-8 h-12 w-2 -translate-x-1/2 rounded-full bg-zinc-300" />
        <div className="absolute left-1/2 -bottom-12 h-8 w-px -translate-x-1/2 bg-zinc-400" />
      </div>

      <div
        className="float-med-delay absolute bottom-[14%] left-[42%] hidden h-3 w-56 rounded-full bg-gradient-to-r from-zinc-300 via-white to-blue-100 shadow-lg shadow-blue-100/60 lg:block"
        style={{ "--rotate": "22deg", "--move-x": "-18px", "--move-y": "12px" } as React.CSSProperties}
      >
        <div className="absolute -left-9 top-1/2 h-9 w-12 -translate-y-1/2 rounded-md border border-zinc-200 bg-white" />
        <div className="absolute -right-20 top-1/2 h-px w-20 -translate-y-1/2 bg-zinc-400" />
        <div className="absolute -right-24 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-zinc-400" />
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
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Bạn đã hủy thao tác trên MetaMask.");
      } else {
        setError(getApiErrorMessage(err, err?.message || "Đăng nhập MetaMask thất bại."));
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
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Đăng nhập demo thất bại."));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0,#f8fafc_32%,#f8fafc_100%)]">
      <MedicalBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10">
            <Activity className="h-5 w-5 text-blue-600" />
          </div>
          <span className="text-xl font-bold text-zinc-950">VaxiTrust</span>
        </div>
        {address ? (
          <div className="hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-600 shadow-sm sm:block">
            {shortAddress(address)}
          </div>
        ) : null}
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-8 px-5 pb-6 pt-2 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:px-8">
        <section className="space-y-7 py-6">
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight text-zinc-950 sm:text-5xl">
              Xác thực chuỗi cung ứng vaccine
            </h1>
            <p className="max-w-xl text-base leading-7 text-zinc-600">
              Nền tảng quản lý logistics y tế ứng dụng Blockchain để theo dõi lô vaccine, chuyển giao và xác minh công khai.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <InfoRow icon={Shield} text="Phân quyền bằng Smart Contract" />
            <InfoRow icon={Lock} text="Đăng nhập bằng chữ ký MetaMask" />
            <InfoRow icon={Activity} text="Đồng bộ dữ liệu Firebase và IPFS" />
          </div>
        </section>

        <section className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white/92 p-6 shadow-xl shadow-blue-950/5 backdrop-blur">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-zinc-950">Đăng nhập hệ thống</h2>
            <p className="mt-1 text-sm text-zinc-500">Chọn ví demo hoặc đăng nhập trực tiếp bằng MetaMask.</p>
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
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <Icon className="mx-auto h-6 w-6" />
                  <span className="mt-2 block text-sm font-bold">{roleLabel[actor.role] || actor.label || actor.role}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ví demo</p>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-xs text-zinc-600">
              {selectedActor?.address || "Chưa có ví demo"}
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading || !selectedActor}
            className="mt-5 flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Đang đăng nhập..." : "Đăng nhập bằng ví demo"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs font-bold text-zinc-400">HOẶC</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleMetaMask}
              disabled={isLoading}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-800 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
            >
              MetaMask
            </button>
            <button
              type="button"
              disabled
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-bold text-zinc-400 opacity-60"
            >
              <Link2 className="h-4 w-4" />
              WalletConnect
            </button>
          </div>

          {isConnected && address ? (
            <div className="mt-5 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ví đang kết nối</p>
                <p className="mt-1 font-mono text-xs text-blue-700">{shortAddress(address)}</p>
              </div>
              <button onClick={() => disconnect()} className="text-xs font-bold text-zinc-500 hover:text-zinc-900">
                Ngắt kết nối
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

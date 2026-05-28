"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnectors, useConnect, useDisconnect } from "wagmi";
import {
  Shield,
  Lock,
  Activity,
  Building2,
  Truck,
  Stethoscope,
  User,
  Link2,
} from "lucide-react";
import { login, getApiErrorMessage } from "@/lib/api";
import { setSession, demoActors, loginDemo } from "@/lib/auth";

// ─── Design data ───────────────────────────────────────────────
const ROLE_CARDS = [
  { role: "MANUFACTURER", label: "NHÀ SẢN XUẤT", icon: Building2 },
  { role: "DISTRIBUTOR",  label: "NHÀ PHÂN PHỐI", icon: Truck },
  { role: "CLINIC",       label: "PHÒNG KHÁM",    icon: Stethoscope },
  { role: "PUBLIC",       label: "NGƯỜI DÙNG",    icon: User },
];

const FEATURES = [
  { Icon: Shield,   label: "Phân quyền Smart Contract" },
  { Icon: Lock,     label: "Bảo mật Web3" },
  { Icon: Activity, label: "Dữ liệu thời gian thực" },
];

// ─── Sub-components ────────────────────────────────────────────
function BlockchainBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 shadow-sm">
      <span
        className={`h-2 w-2 rounded-full ${connected ? "bg-[#16a34a]" : "bg-gray-300"}`}
      />
      <span className="mono-label text-[#16a34a]">
        BLOCKCHAIN:{"\n"}{connected ? "CONNECTED" : "OFFLINE"}
      </span>
    </div>
  );
}

function WalletBadge({ address }: { address?: string }) {
  if (!address) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2">
      <span className="h-3.5 w-3.5 text-[#2e7dff]">⬡</span>
      <span
        className="text-[#475569]"
        style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 16 }}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
    </div>
  );
}

function FeatureRow({ Icon, label }: { Icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#e2e8f0] bg-[#f1f5f9]">
        <Icon className="h-5 w-5 text-[#2e7dff]" />
      </div>
      <span
        className="text-[#131317]"
        style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 18, lineHeight: "27px" }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { mutateAsync: connectAsync } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();

  const [selectedRole, setSelectedRole] = useState("MANUFACTURER");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedActor = demoActors.find((a) => a.role === selectedRole) ?? demoActors[0];

  // ── MetaMask connect & login ─────────────────────────────────
  async function handleMetaMask() {
    setError(null);
    setIsLoading(true);
    try {
      let walletAddress = address;
      if (!isConnected || !walletAddress) {
        const inj = connectors.find((c) => c.id === "injected") ?? connectors[0];
        if (!inj) throw new Error("MetaMask not found. Install the extension and refresh.");
        const result = await connectAsync({ connector: inj });
        walletAddress = result.accounts[0];
      }
      const { token, user } = await login({ address: walletAddress!, role: selectedRole });
      setSession(token, user);
      router.push("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("MetaMask connection was cancelled.");
      } else {
        setError(getApiErrorMessage(err, "Connection failed."));
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ── Demo login (selected Hardhat actor) ─────────────────────
  async function handleDemoLogin() {
    setError(null);
    setIsLoading(true);
    try {
      await loginDemo(selectedActor);
      router.push("/dashboard");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Demo login failed."));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-bg flex min-h-screen flex-col">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="flex w-full max-w-[1440px] items-center justify-between self-center px-8 py-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="icon-pill flex h-10 w-10 items-center justify-center rounded-2xl">
            <Activity className="h-5 w-5 text-[#2e7dff]" />
          </div>
          <span
            className="text-[#000000]"
            style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.6px" }}
          >
            VaxiTrust
          </span>
        </div>

        {/* Right side indicators */}
        <div className="flex items-center gap-3">
          <BlockchainBadge connected={true} />
          {isConnected && address ? (
            <WalletBadge address={address} />
          ) : null}
        </div>
      </header>

      {/* ── Main 2-col layout ──────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center px-8 py-8">
        <div className="grid w-full max-w-[1440px] grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-16">

          {/* ── Left: Branding ────────────────────────────────── */}
          <section className="flex flex-col justify-center gap-12 lg:order-1">
            {/* Heading */}
            <div className="space-y-6">
              <h1
                className="leading-tight text-[#131317]"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 800,
                  fontSize: "clamp(40px, 4vw, 56px)",
                  lineHeight: 1.1,
                  letterSpacing: "-1px",
                }}
              >
                Xác thực chuỗi<br />cung ứng Vaccine
              </h1>
              <p
                className="max-w-[512px] text-[#64748b]"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 400,
                  fontSize: 20,
                  lineHeight: "32.5px",
                }}
              >
                Nền tảng quản lý logistics y tế ứng dụng Blockchain
                mang lại sự minh bạch tuyệt đối và an toàn cho cộng đồng.
              </p>
            </div>

            {/* Features */}
            <div className="flex flex-col gap-6">
              {FEATURES.map(({ Icon, label }) => (
                <FeatureRow key={label} Icon={Icon} label={label} />
              ))}
            </div>

            {/* Decorative "System Live" card */}
            <div className="relative h-60 overflow-hidden rounded-3xl border border-[#e2e8f0] bg-[#f8fafc]">
              {/* Simulated cold-chain pattern */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, rgba(46,125,255,0.03) 0px, rgba(46,125,255,0.03) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(-45deg, rgba(46,125,255,0.03) 0px, rgba(46,125,255,0.03) 1px, transparent 1px, transparent 40px)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(0deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 50%)",
                }}
              />
              {/* Large decorative icon */}
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <Shield className="h-32 w-32 text-[#2e7dff]" />
              </div>
              {/* SYSTEM LIVE badge */}
              <div
                className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full px-4 py-2"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(46,125,255,0.20)",
                }}
              >
                <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
                <span
                  className="text-[#2e7dff]"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "1.2px",
                  }}
                >
                  SYSTEM LIVE
                </span>
              </div>
            </div>
          </section>

          {/* ── Right: Login card ──────────────────────────────── */}
          <section className="flex items-center justify-end lg:order-2">
            <div className="glass-card flex w-full max-w-[520px] flex-col gap-8 rounded-3xl p-10">

              {/* Heading */}
              <div className="space-y-2 text-center">
                <h2
                  className="text-[#131317]"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 800,
                    fontSize: 32,
                    lineHeight: "48px",
                  }}
                >
                  Chào mừng quay lại
                </h2>
                <p
                  className="text-[#64748b]"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                    fontSize: 16,
                    lineHeight: "24px",
                  }}
                >
                  Chọn vai trò và đăng nhập vào hệ thống
                </p>
              </div>

              {/* Role selection grid */}
              <div className="grid grid-cols-2 gap-4">
                {ROLE_CARDS.map(({ role, label, icon: Icon }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`flex flex-col items-center gap-3 rounded-2xl p-6 transition-all duration-150 ${
                      selectedRole === role ? "role-card-active" : "role-card-idle hover:border-[#c7d4e8]"
                    }`}
                  >
                    <Icon
                      className={`h-7 w-7 ${selectedRole === role ? "text-[#2e7dff]" : "text-[#64748b]"}`}
                    />
                    <span
                      className={`text-center ${selectedRole === role ? "text-[#131317]" : "text-[#64748b]"}`}
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontWeight: 700,
                        fontSize: 14,
                        letterSpacing: "0.7px",
                        lineHeight: "21px",
                      }}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Demo address display */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label
                    className="block text-[#64748b]"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: "1.3px",
                    }}
                  >
                    ĐỊA CHỈ VÍ / DEMO ACTOR
                  </label>
                  <div
                    className="flex h-14 w-full items-center rounded-xl border border-[#6b7280] bg-white px-5"
                    style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 13, color: "#6b7280" }}
                  >
                    {selectedActor.address}
                  </div>
                </div>

                {/* Error */}
                {error ? (
                  <p
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600"
                  >
                    {error}
                  </p>
                ) : null}

                {/* CTA login button */}
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={isLoading}
                  className="btn-brand flex h-14 w-full items-center justify-center rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <span
                    className="text-white"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontWeight: 800,
                      fontSize: 16,
                      letterSpacing: "1.6px",
                    }}
                  >
                    {isLoading ? "ĐANG ĐĂNG NHẬP…" : "ĐĂNG NHẬP"}
                  </span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center py-2">
                <div className="absolute inset-x-0 top-1/2 h-px bg-[#e2e8f0]" />
                <span
                  className="relative bg-white px-6 text-[#64748b]"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "1.2px",
                  }}
                >
                  HOẶC KẾT NỐI VÍ
                </span>
              </div>

              {/* Wallet buttons */}
              <div className="grid grid-cols-2 gap-4">
                {/* MetaMask */}
                <button
                  type="button"
                  onClick={handleMetaMask}
                  disabled={isLoading}
                  className="flex h-14 items-center justify-center gap-3 rounded-xl border border-[#e2e8f0] bg-white transition-colors hover:border-[#2e7dff] hover:bg-[#f0f6ff] disabled:opacity-50"
                >
                  {/* MetaMask fox icon */}
                  <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M27.1 4L17.6 11.1L19.4 6.9L27.1 4Z" fill="#E2761B" stroke="#E2761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4.9 4L14.3 11.2L12.6 6.9L4.9 4Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M23.7 21.3L21.1 25.3L26.5 26.8L28.1 21.4L23.7 21.3Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3.9 21.4L5.5 26.8L10.9 25.3L8.3 21.3L3.9 21.4Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10.6 14.6L9 17.1L14.3 17.3L14.1 11.6L10.6 14.6Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21.4 14.6L17.8 11.5L17.7 17.3L23 17.1L21.4 14.6Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10.9 25.3L14 23.7L11.3 21.4L10.9 25.3Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M18 23.7L21.1 25.3L20.7 21.4L18 23.7Z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span
                    className="text-[#131317]"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: "0.7px",
                    }}
                  >
                    METAMASK
                  </span>
                </button>

                {/* WalletConnect */}
                <button
                  type="button"
                  disabled
                  className="flex h-14 items-center justify-center gap-3 rounded-xl border border-[#e2e8f0] bg-white opacity-50 cursor-not-allowed"
                >
                  <Link2 className="h-5 w-5 text-[#3b82f6]" />
                  <span
                    className="text-[#131317]"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: "0.7px",
                    }}
                  >
                    WALLETCONNECT
                  </span>
                </button>
              </div>

              {/* Connected wallet display */}
              {isConnected && address ? (
                <div className="flex items-center justify-between rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                  <div>
                    <p
                      className="text-[#64748b]"
                      style={{ fontSize: 11, letterSpacing: "1.1px", fontWeight: 700 }}
                    >
                      VÍ ĐÃ KẾT NỐI
                    </p>
                    <p
                      className="mt-0.5 text-[#2e7dff]"
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 14 }}
                    >
                      {address.slice(0, 10)}…{address.slice(-6)}
                    </p>
                  </div>
                  <button
                    onClick={() => disconnect()}
                    className="text-xs font-bold text-[#64748b] hover:text-[#131317] transition-colors"
                  >
                    Ngắt kết nối
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full max-w-[1440px] self-center border-t border-[#e2e8f0] px-8 py-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Tech annotation */}
          <div>
            <p
              className="text-[#2e7dff]"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "2.2px",
              }}
            >
              [SYSTEM.LOG] AUTHENTICATION ARCHITECTURE LAYER 2:
            </p>
          </div>
          {/* Links */}
          <nav className="flex items-center gap-8">
            {["CHÍNH SÁCH BẢO MẬT", "ĐIỀU KHOẢN DỊCH VỤ", "TÀI LIỆU KỸ THUẬT"].map((link) => (
              <a
                key={link}
                href="#"
                className="text-[#64748b] transition-colors hover:text-[#2e7dff]"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "1.2px",
                }}
              >
                {link}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <a
              href="mailto:SUPPORT@VAXITRUST.COM"
              className="flex items-center gap-2 text-[#64748b]/70 transition-colors hover:text-[#64748b]"
            >
              <span className="text-sm">✉</span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "1.2px",
                }}
              >
                SUPPORT@VAXITRUST.COM
              </span>
            </a>
            <a
              href="tel:+84886014461"
              className="flex items-center gap-2 text-[#64748b]/70 transition-colors hover:text-[#64748b]"
            >
              <span className="text-sm">📞</span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "1.2px",
                }}
              >
                +84 886 014 461
              </span>
            </a>
          </div>
          <p
            className="text-[#64748b]/50"
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "3.6px",
            }}
          >
            © 2026 VAXITRUST. BLOCKCHAIN VERIFIED LOGISTICS.
          </p>
        </div>
      </footer>
    </div>
  );
}

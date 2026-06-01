"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { ArrowRight, Camera, Keyboard, ShieldCheck } from "lucide-react";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { ContactFooter } from "@/components/layout/ContactFooter";
import { useLanguage } from "@/providers/LanguageProvider";

type ScanMode = "manual" | "camera";

const copy = {
  en: {
    network: "VaxiTrust Network",
    title: "Vaccine verification",
    live: "Blockchain live",
    description: "Scan a QR code or enter a serial ID to verify origin, transfer history, and vaccine safety status.",
    manual: "Enter serial",
    scanQr: "Scan QR",
    verify: "Verify",
    cameraError: "Camera error:",
    cameraHint: "Point the camera at the QR code on the vaccine",
    switchManual: "Switch to manual entry",
    b2bLogin: "B2B login",
    dashboard: "Dashboard",
    footer: "Powered by Ethereum · IPFS · Zero-Knowledge Proof",
  },
  vi: {
    network: "Mạng VaxiTrust",
    title: "Xác thực vaccine",
    live: "Blockchain đang hoạt động",
    description: "Quét mã QR hoặc nhập serial ID để xác minh nguồn gốc, lịch sử vận chuyển và tình trạng an toàn của vaccine.",
    manual: "Nhập serial",
    scanQr: "Quét QR",
    verify: "Xác minh",
    cameraError: "Lỗi camera:",
    cameraHint: "Hướng camera vào mã QR trên vaccine",
    switchManual: "Chuyển sang nhập thủ công",
    b2bLogin: "Đăng nhập B2B",
    dashboard: "Dashboard",
    footer: "Vận hành bởi Ethereum · IPFS · Zero-Knowledge Proof",
  },
} as const;

function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed right-4 top-4 z-20 flex rounded-full border border-zinc-800 bg-zinc-900/90 p-1 shadow-lg backdrop-blur">
      {(["vi", "en"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
            language === item ? "bg-emerald-500 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const text = copy[language];
  const [serialId, setSerialId] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("manual");
  const [scanError, setScanError] = useState<string | null>(null);

  const goVerify = (id: string) => {
    const trimmed = id.trim();
    if (trimmed) {
      router.push(`/consumer/verify/${encodeURIComponent(trimmed)}`);
    }
  };

  const handleScan = (detectedCodes: { rawValue: string }[]) => {
    const value = detectedCodes[0]?.rawValue;
    if (value) {
      setScanMode("manual");
      goVerify(value);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12 text-white">
      <LanguageSwitch />

      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full justify-center">
            <VaxiTrustLogo className="h-20 w-20" iconClassName="h-12 w-12" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {text.network}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">{text.title}</h1>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-emerald-400">
            {text.live}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-zinc-400">{text.description}</p>

        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-800/50 p-1">
            <button
              onClick={() => {
                setScanMode("manual");
                setScanError(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                scanMode === "manual" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
              type="button"
            >
              <Keyboard className="h-3.5 w-3.5" />
              {text.manual}
            </button>
            <button
              onClick={() => {
                setScanMode("camera");
                setScanError(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                scanMode === "camera" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
              type="button"
            >
              <Camera className="h-3.5 w-3.5" />
              {text.scanQr}
            </button>
          </div>

          {scanMode === "manual" ? (
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={serialId}
                onChange={(e) => setSerialId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goVerify(serialId)}
                placeholder="VCN-20260115-001"
              />
              <button
                onClick={() => goVerify(serialId)}
                disabled={!serialId.trim()}
                className="btn-brand flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                type="button"
              >
                <ShieldCheck className="h-4 w-4" />
                {text.verify}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-zinc-700">
                <Scanner
                  onScan={handleScan}
                  onError={(err) => setScanError(String(err))}
                  styles={{ container: { borderRadius: "0.75rem" } }}
                />
              </div>
              {scanError ? (
                <p className="text-xs text-red-400">
                  {text.cameraError} {scanError}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">{text.cameraHint}</p>
              )}
              <button
                onClick={() => setScanMode("manual")}
                className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-white"
                type="button"
              >
                {text.switchManual}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            {text.b2bLogin} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            {text.dashboard}
          </Link>
        </div>

        <p className="font-mono text-[10px] text-zinc-600">{text.footer}</p>
      </div>
      <ContactFooter className="mt-12 w-full max-w-5xl" />
    </main>
  );
}

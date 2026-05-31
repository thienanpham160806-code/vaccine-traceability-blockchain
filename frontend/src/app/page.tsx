"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { ArrowRight, Camera, Keyboard, ShieldCheck } from "lucide-react";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { useTranslation } from "@/providers/LanguageProvider";

type ScanMode = "manual" | "camera";

export default function HomePage() {
  const router = useRouter();
  const t = useTranslation();
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12 text-white">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <VaxiTrustLogo
            className="h-20 w-20"
            iconClassName="h-12 w-12"
            showWordmark
            wordmarkClassName="text-5xl text-white"
          />
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              VaxiTrust Network
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">{t("Xác thực vaccine")}</h1>
          </div>
        </div>

        {/* Live badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-emerald-400">
            {t("Blockchain Live")}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-zinc-400">
          {t("Quét mã QR hoặc nhập Serial ID để xác minh nguồn gốc, lịch sử vận chuyển và tình trạng an toàn của vaccine.")}
        </p>

        {/* Verify widget */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-800/50 p-1">
            <button
              onClick={() => { setScanMode("manual"); setScanError(null); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                scanMode === "manual"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Keyboard className="h-3.5 w-3.5" />
              {t("Nhập Serial")}
            </button>
            <button
              onClick={() => { setScanMode("camera"); setScanError(null); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                scanMode === "camera"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              {t("Quét QR")}
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
              >
                <ShieldCheck className="h-4 w-4" />
                Verify
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
                <p className="text-xs text-red-400">Lỗi camera: {scanError}</p>
              ) : (
                <p className="text-xs text-zinc-500">Hướng camera vào mã QR trên vaccine</p>
              )}
              <button
                onClick={() => setScanMode("manual")}
                className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-white"
              >
                {t("Chuyển sang nhập thủ công")}
              </button>
            </div>
          )}
        </div>

        {/* B2B link */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            {t("Đăng nhập B2B")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            {t("Dashboard")}
          </Link>
        </div>

        {/* Footer */}
        <p className="font-mono text-[10px] text-zinc-600">
          {t("Powered by Ethereum · IPFS · Zero-Knowledge Proof")}
        </p>
      </div>
    </main>
  );
}

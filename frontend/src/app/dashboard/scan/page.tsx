"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Camera, Keyboard, Search, ShieldAlert } from "lucide-react";
import { parseVaxiTrustQr, verifyHrefFromQr } from "@/lib/qr";
import { useTranslation } from "@/providers/LanguageProvider";

export default function DashboardScanPage() {
  const router = useRouter();
  const t = useTranslation();
  const [manualValue, setManualValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const goLookup = (value: string) => {
    const parsed = parseVaxiTrustQr(value);
    if (!parsed.valid) {
      setMessage(parsed.reason);
      setIsPaused(false);
      return;
    }

    setMessage(null);
    setIsPaused(true);
    router.push(verifyHrefFromQr(parsed, "consumer", { returnTo: "dashboard" }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{t("Quét QR")}</p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t("Tra cứu QR / serial")}</h1>
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <Camera className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            {t("Hướng camera vào mã QR do VaxiTrust tạo.")}
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            {!isPaused ? (
              <Scanner
                onScan={(detectedCodes) => {
                  const value = detectedCodes[0]?.rawValue;
                  if (value) goLookup(value);
                }}
                onError={(err) => setMessage(String(err))}
              />
            ) : (
              <div className="flex min-h-72 items-center justify-center text-sm font-semibold text-zinc-300">
                {t("Đang mở kết quả...")}
              </div>
            )}
          </div>

          {message ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {message}
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <Keyboard className="h-3.5 w-3.5" />
              {t("Nhập thủ công")}
            </div>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-500/20"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && goLookup(manualValue)}
                placeholder="VCN-DEMO-001"
              />
              <button
                type="button"
                onClick={() => goLookup(manualValue)}
                disabled={!manualValue.trim()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Search className="h-4 w-4" />
                {t("Tra cứu")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

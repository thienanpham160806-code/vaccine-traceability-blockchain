"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Camera, CheckCircle2, ExternalLink, Keyboard, Search, ShieldAlert, Syringe, XCircle } from "lucide-react";
import { administerProduct, getApiErrorMessage } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { parseVaxiTrustQr, verifyHrefFromQr } from "@/lib/qr";
import { useTranslation } from "@/providers/LanguageProvider";

type AdministerState =
  | { phase: "idle" }
  | { phase: "confirm"; serialId: string }
  | { phase: "loading"; serialId: string }
  | { phase: "success"; serialId: string; auditId: string }
  | { phase: "error"; serialId: string; message: string };

export default function DashboardScanPage() {
  const router = useRouter();
  const t = useTranslation();
  const [manualValue, setManualValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [administer, setAdminister] = useState<AdministerState>({ phase: "idle" });
  const [reason, setReason] = useState("");

  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const isEndUser = user?.role === "CLINIC" || user?.role === "PHARMACY";

  const goLookup = (value: string, source: "manual" | "scan") => {
    const parsed = parseVaxiTrustQr(value, { source });
    if (!parsed.valid) {
      setMessage(parsed.reason);
      setIsPaused(false);
      return;
    }

    setMessage(null);

    if (isEndUser) {
      setIsPaused(true);
      setAdminister({ phase: "confirm", serialId: parsed.value });
      setReason("");
      return;
    }

    setIsPaused(true);
    router.push(verifyHrefFromQr(parsed, "consumer", { returnTo: "dashboard" }));
  };

  const handleAdminister = async (serialId: string) => {
    setAdminister({ phase: "loading", serialId });
    try {
      const result = await administerProduct(serialId, { reason: reason.trim() || undefined });
      setAdminister({ phase: "success", serialId, auditId: result.auditId });
    } catch (err: unknown) {
      setAdminister({ phase: "error", serialId, message: getApiErrorMessage(err, t("Không thể đánh dấu đã tiêm.")) });
    }
  };

  const handleVerifyOnly = (serialId: string) => {
    const parsed = parseVaxiTrustQr(serialId);
    if (parsed.valid) {
      router.push(verifyHrefFromQr(parsed, "consumer", { returnTo: "dashboard" }));
    } else {
      router.push(`/dashboard/verify/${encodeURIComponent(serialId)}`);
    }
  };

  const resetScan = () => {
    setAdminister({ phase: "idle" });
    setIsPaused(false);
    setReason("");
    setMessage(null);
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
            {isEndUser
              ? t("Quét QR lọ vaccine để đánh dấu đã tiêm.")
              : t("Hướng camera vào mã QR do VaxiTrust tạo.")}
          </div>
        </div>
        <div className="space-y-4 p-4">
          {administer.phase === "idle" ? (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
              {!isPaused ? (
                <Scanner
                  onScan={(detectedCodes) => {
                    const value = detectedCodes[0]?.rawValue;
                    if (value) goLookup(value, "scan");
                  }}
                  onError={(err) => setMessage(String(err))}
                />
              ) : (
                <div className="flex min-h-72 items-center justify-center text-sm font-semibold text-zinc-300">
                  {t("Đang xử lý...")}
                </div>
              )}
            </div>
          ) : null}

          {administer.phase === "confirm" ? (
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="flex items-start gap-3">
                <Syringe className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-200" />
                <div>
                  <p className="font-bold text-amber-900 dark:text-amber-100">{t("Xác nhận tiêm vaccine")}</p>
                  <p className="mt-0.5 font-mono text-xs text-amber-700 dark:text-amber-200">{administer.serialId}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">{t("Ghi chú (tuỳ chọn)")}</p>
                <input
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-zinc-100"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("Ví dụ: Tiêm mũi 1 cho BN Nguyễn Văn A")}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleAdminister(administer.serialId)}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("Đánh dấu đã tiêm")}
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyOnly(administer.serialId)}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("Chỉ tra cứu")}
                </button>
                <button
                  type="button"
                  onClick={resetScan}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <XCircle className="h-4 w-4" />
                  {t("Quét lại")}
                </button>
              </div>
            </div>
          ) : null}

          {administer.phase === "loading" ? (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm font-semibold text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {t("Đang ghi nhận lên hệ thống...")}
            </div>
          ) : null}

          {administer.phase === "success" ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-900 dark:text-emerald-100">{t("Đã đánh dấu tiêm thành công")}</p>
                  <p className="mt-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300">{administer.serialId}</p>
                  <p className="mt-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">Audit: {administer.auditId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetScan}
                className="flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Camera className="h-4 w-4" />
                {t("Quét lọ tiếp theo")}
              </button>
            </div>
          ) : null}

          {administer.phase === "error" ? (
            <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/10">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
                <div>
                  <p className="font-bold text-red-800 dark:text-red-100">{t("Không thể đánh dấu đã tiêm")}</p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-200">{administer.message}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleVerifyOnly(administer.serialId)}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("Tra cứu thông tin lọ")}
                </button>
                <button
                  type="button"
                  onClick={resetScan}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {t("Quét lại")}
                </button>
              </div>
            </div>
          ) : null}

          {message ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {message}
            </div>
          ) : null}

          {administer.phase === "idle" ? (
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
                  onKeyDown={(event) => event.key === "Enter" && goLookup(manualValue, "manual")}
                  placeholder="VCN-DEMO-001"
                />
                <button
                  type="button"
                  onClick={() => goLookup(manualValue, "manual")}
                  disabled={!manualValue.trim()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <Search className="h-4 w-4" />
                  {t("Tra cứu")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

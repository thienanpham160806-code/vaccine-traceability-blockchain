"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  HelpCircle,
  Languages,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { getProductStatusLabel } from "@/lib/status";
import type { VerifyResult } from "@/lib/types";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
import { ContactFooter } from "@/components/layout/ContactFooter";
import { TransferTimeline } from "@/components/trace/TransferTimeline";
import { useLanguage } from "@/providers/LanguageProvider";

interface PageProps {
  params: Promise<{ serialId: string }>;
}

type ViewState = "loading" | "success" | "duplicate" | "not_found" | "error";

const copy = {
  en: {
    loading: "Verifying on blockchain...",
    notFoundTitle: "Product Not Found",
    notFoundPrefix: "No vaccine record matches",
    notFoundHint: "Make sure the QR code, batch code, or serial ID is correct and the product has been registered.",
    tryAnother: "Try another serial ID, batch code, or QR payload",
    placeholder: "Enter serial ID, batch code, or QR payload...",
    verify: "Verify",
    backHome: "Back to home",
    duplicateTitle: "Suspicious Scan Detected",
    duplicateText: "This vaccine has been flagged for an abnormal scan pattern. It may require additional verification.",
    productDetails: "Product Details",
    serialId: "Serial ID",
    product: "Product",
    status: "Status",
    risk: "Risk",
    whatToDo: "What to do:",
    action1: "Do not administer this vaccine without further verification",
    action2: "Contact the distributor or clinic for clarification",
    action3: "Report a dispute if you suspect tampering",
    viewAnyway: "View full details anyway",
    verifiedTitle: "Vaccine Verified",
    verifiedText: "This vaccine is authentic and traceable on the blockchain.",
    manufacturer: "Manufacturer",
    expiryDate: "Expiry date",
    zkProof: "ZK proof",
    zkVerified: "Verified",
    zkNotVerified: "Not verified",
    recallWarning: "This batch has been recalled. Do not administer.",
    timeline: "Supply chain timeline",
    noTimeline: "No transfer timeline has been recorded yet.",
    unknown: "Unknown",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  vi: {
    loading: "Đang xác minh trên blockchain...",
    notFoundTitle: "Không tìm thấy sản phẩm",
    notFoundPrefix: "Không có hồ sơ vaccine khớp với",
    notFoundHint: "Hãy kiểm tra lại mã QR, mã lô hoặc serial ID và đảm bảo sản phẩm đã được đăng ký.",
    tryAnother: "Thử serial ID, mã lô hoặc dữ liệu QR khác",
    placeholder: "Nhập serial ID, mã lô hoặc dữ liệu QR...",
    verify: "Xác minh",
    backHome: "Về trang chủ",
    duplicateTitle: "Phát hiện lượt quét bất thường",
    duplicateText: "Vaccine này đã bị cảnh báo vì mẫu quét bất thường. Sản phẩm có thể cần xác minh thêm.",
    productDetails: "Chi tiết sản phẩm",
    serialId: "Serial ID",
    product: "Sản phẩm",
    status: "Trạng thái",
    risk: "Rủi ro",
    whatToDo: "Cần làm gì:",
    action1: "Không sử dụng vaccine khi chưa xác minh thêm",
    action2: "Liên hệ nhà phân phối hoặc phòng khám để đối chiếu",
    action3: "Gửi khiếu nại nếu nghi ngờ bị can thiệp",
    viewAnyway: "Vẫn xem chi tiết",
    verifiedTitle: "Vaccine đã được xác minh",
    verifiedText: "Vaccine này hợp lệ và có thể truy xuất trên blockchain.",
    manufacturer: "Nhà sản xuất",
    expiryDate: "Ngày hết hạn",
    zkProof: "ZK proof",
    zkVerified: "Đã xác minh",
    zkNotVerified: "Chưa xác minh",
    recallWarning: "Lô này đã bị thu hồi. Không sử dụng vaccine.",
    timeline: "Lịch sử chuỗi cung ứng",
    noTimeline: "Chưa có lịch sử chuyển giao nào được ghi nhận.",
    unknown: "Không rõ",
    theme: "Giao diện",
    language: "Ngôn ngữ",
    light: "Sáng",
    dark: "Tối",
    system: "Hệ thống",
  },
} as const;

const themeOptions = [
  { value: "light", icon: Sun, labelKey: "light" },
  { value: "dark", icon: Moon, labelKey: "dark" },
  { value: "system", icon: Monitor, labelKey: "system" },
] as const;

function VerifyControls() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const text = copy[language];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div
        aria-label={text.theme}
        className="flex rounded-lg border border-zinc-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const selected = (theme || "system") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
                selected
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
              title={text[option.labelKey]}
              aria-label={text[option.labelKey]}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div
        aria-label={text.language}
        className="flex rounded-lg border border-zinc-200 bg-white/80 p-1 text-xs font-bold shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        <Languages className="mx-2 my-auto h-4 w-4 text-zinc-400" />
        {(["vi", "en"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLanguage(item)}
            className={`flex h-9 min-w-10 items-center justify-center gap-1 rounded-md px-2 transition ${
              language === item
                ? "bg-blue-600 text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
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

function VerifyShell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_20%_18%,#dbeafe_0,#f8fafc_34%,#f8fafc_100%)] px-5 py-5 text-zinc-950 dark:bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.1)_0,rgba(15,23,42,0.88)_32%,#09090b_100%)] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-11rem)] w-full max-w-5xl flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <VaxiTrustLogo
            className="h-12 w-12"
            iconClassName="h-7 w-7"
            showWordmark
            wordmarkClassName="text-2xl"
            subtitle={language === "en" ? "VACCINE TRACEABILITY" : "TRUY XUẤT VACCINE"}
          />
          <VerifyControls />
        </header>

        {children}
      </div>

      <ContactFooter animatedBackdrop className="-mx-5 mt-8 rounded-none border-x-0 border-b-0 px-5 sm:px-8" />
    </main>
  );
}

function StatusBadge({
  status,
  recalled,
  language,
}: {
  status: string;
  recalled: boolean;
  language: "en" | "vi";
}) {
  if (recalled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <span className="h-2 w-2 rounded-full bg-current" />
        {getProductStatusLabel("RECALLED", language)}
      </span>
    );
  }

  const map: Record<string, string> = {
    VERIFIED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    DELIVERED: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    PENDING_DELIVERY: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200",
    FLAGGED: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${map[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {getProductStatusLabel(status, language)}
    </span>
  );
}

export default function ConsumerVerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const router = useRouter();
  const { language } = useLanguage();
  const text = copy[language];
  const decodedLookup = decodeURIComponent(serialId);
  const [data, setData] = useState<VerifyResult | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [retryId, setRetryId] = useState("");

  useEffect(() => {
    if (!serialId) return;
    setViewState("loading");

    api
      .get(endpoints.consumerVerify(decodedLookup))
      .then((res) => {
        const result: VerifyResult = res.data.data;
        if (!result?.product) {
          setViewState("not_found");
          return;
        }

        const hasDuplicateScan = result.product.riskLevel === "HIGH" || result.product.riskLevel === "ALERT";
        setData(result);
        setViewState(hasDuplicateScan && result.product.status === "FLAGGED" ? "duplicate" : "success");
      })
      .catch((err) => {
        setViewState(err?.response?.status === 404 ? "not_found" : "error");
      });
  }, [decodedLookup, serialId]);

  const goRetry = () => {
    if (retryId.trim()) {
      router.push(`/consumer/verify/${encodeURIComponent(retryId.trim())}`);
    }
  };

  if (viewState === "loading") {
    return (
      <VerifyShell>
        <section className="flex flex-1 items-center justify-center py-16">
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white/80 px-10 py-8 text-center shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{text.loading}</p>
          </div>
        </section>
      </VerifyShell>
    );
  }

  if (viewState === "not_found" || viewState === "error") {
    return (
      <VerifyShell>
        <section className="mx-auto flex w-full max-w-2xl flex-1 items-center py-10">
          <div className="w-full space-y-6 rounded-2xl border border-zinc-200 bg-white/90 p-6 text-center shadow-2xl shadow-blue-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
              <HelpCircle className="h-9 w-9" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">{text.notFoundTitle}</h1>
              <p className="break-words text-sm text-zinc-500 dark:text-zinc-400">
                {text.notFoundPrefix} <span className="font-mono text-zinc-700 dark:text-zinc-200">{decodedLookup}</span>.
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{text.notFoundHint}</p>
            </div>

            <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{text.tryAnother}</p>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
                  value={retryId}
                  onChange={(e) => setRetryId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goRetry()}
                  placeholder={text.placeholder}
                />
                <button
                  onClick={goRetry}
                  disabled={!retryId.trim()}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {text.verify}
                </button>
              </div>
            </div>

            <a href="/" className="inline-flex text-sm text-zinc-500 transition hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-300">
              {text.backHome}
            </a>
          </div>
        </section>
      </VerifyShell>
    );
  }

  if (viewState === "duplicate" && data) {
    const { product } = data;
    return (
      <VerifyShell>
        <section className="mx-auto flex w-full max-w-md flex-1 items-center py-10">
          <div className="w-full space-y-6 rounded-2xl border border-orange-200 bg-white/90 p-6 shadow-2xl shadow-orange-950/5 backdrop-blur dark:border-orange-500/30 dark:bg-zinc-900/95 dark:shadow-black/20">
            <div className="space-y-3 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                <AlertTriangle className="h-9 w-9" />
              </div>
              <h1 className="text-2xl font-bold">{text.duplicateTitle}</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{text.duplicateText}</p>
            </div>

            <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">{text.productDetails}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500 dark:text-zinc-400">{text.serialId}</span>
                  <span className="font-mono font-semibold">{product.serialId}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500 dark:text-zinc-400">{text.product}</span>
                  <span className="font-semibold">{product.productName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500 dark:text-zinc-400">{text.status}</span>
                  <span className="font-semibold text-orange-700 dark:text-orange-300">{getProductStatusLabel(product.status, language)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500 dark:text-zinc-400">{text.risk}</span>
                  <span className="font-semibold text-orange-700 dark:text-orange-300">{product.riskLevel}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">{text.whatToDo}</p>
              <ul className="list-inside list-disc space-y-1 text-xs">
                <li>{text.action1}</li>
                <li>{text.action2}</li>
                <li>{text.action3}</li>
              </ul>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setViewState("success")}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {text.viewAnyway}
              </button>
              <a href="/" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                {text.backHome}
              </a>
            </div>
          </div>
        </section>
      </VerifyShell>
    );
  }

  if (!data) return null;

  const { product, batch, timeline, recallStatus, zkProofVerified } = data;

  return (
    <VerifyShell>
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 py-10">
        <div className="space-y-3 text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold">{text.verifiedTitle}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{text.verifiedText}</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-2xl shadow-blue-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{text.serialId}</p>
              <p className="mt-0.5 font-mono text-sm font-bold">{product?.serialId}</p>
            </div>
            <StatusBadge status={product?.status ?? "UNKNOWN"} recalled={recallStatus ?? false} language={language} />
          </div>

          <div className="grid gap-4 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">{text.product}</p>
              <p className="mt-0.5 font-semibold">{product?.productName || batch?.productName || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.manufacturer}</p>
              <p className="mt-0.5 font-semibold">{product?.manufacturerName || batch?.manufacturerName || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.expiryDate}</p>
              <p className="mt-0.5 font-semibold">{product?.expiryDate || batch?.expiryDate || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.zkProof}</p>
              <p className={`mt-0.5 font-semibold ${zkProofVerified ? "text-emerald-600 dark:text-emerald-300" : "text-zinc-500"}`}>
                {zkProofVerified ? text.zkVerified : text.zkNotVerified}
              </p>
            </div>
          </div>

          {recallStatus ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {text.recallWarning}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-2xl shadow-blue-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{text.timeline}</h2>
          </div>

          <TransferTimeline events={timeline || []} currentOwner={product?.currentOwner} language={language} emptyText={text.noTimeline} />
        </div>

        <a href="/" className="block text-center text-sm text-zinc-500 transition hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-300">
          {text.backHome}
        </a>
      </section>
    </VerifyShell>
  );
}

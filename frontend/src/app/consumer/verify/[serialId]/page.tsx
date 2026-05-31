"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { getProductStatusLabel, getTransferStatusLabel } from "@/lib/status";
import type { VerifyResult } from "@/lib/types";
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
  },
} as const;

function formatDate(value: unknown, language: "en" | "vi") {
  if (!value) return "";
  if (typeof value === "number") return new Date(value).toLocaleString(language === "en" ? "en-US" : "vi-VN");
  return String(value);
}

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

function TimelineItem({
  label,
  value,
  sub,
  txHash,
  first,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  txHash?: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full border-2 border-emerald-400 bg-zinc-950 ${first ? "mt-0" : ""}`} />
        {!last ? <div className="mt-1 w-0.5 flex-1 bg-zinc-800" /> : null}
      </div>
      <div className="min-w-0 pb-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-zinc-500">{sub}</p> : null}
        {txHash ? <p className="mt-0.5 max-w-[220px] truncate font-mono text-xs text-zinc-600">{txHash}</p> : null}
      </div>
    </div>
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-sm font-bold text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        {getProductStatusLabel("RECALLED", language)}
      </span>
    );
  }

  const map: Record<string, string> = {
    VERIFIED: "bg-emerald-500/15 text-emerald-300",
    DELIVERED: "bg-blue-500/15 text-blue-300",
    PENDING_DELIVERY: "bg-yellow-500/15 text-yellow-200",
    FLAGGED: "bg-orange-500/15 text-orange-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${map[status] ?? "bg-zinc-800 text-zinc-300"}`}>
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
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <LanguageSwitch />
        <div className="space-y-4 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">{text.loading}</p>
        </div>
      </main>
    );
  }

  if (viewState === "not_found" || viewState === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <LanguageSwitch />
        <div className="w-full max-w-2xl space-y-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-300">
            <HelpCircle className="h-9 w-9" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">{text.notFoundTitle}</h1>
            <p className="break-words text-sm text-zinc-400">
              {text.notFoundPrefix} <span className="font-mono text-zinc-300">{decodedLookup}</span>.
            </p>
            <p className="text-sm text-zinc-500">{text.notFoundHint}</p>
          </div>

          <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">{text.tryAnother}</p>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={retryId}
                onChange={(e) => setRetryId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goRetry()}
                placeholder={text.placeholder}
              />
              <button
                onClick={goRetry}
                disabled={!retryId.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {text.verify}
              </button>
            </div>
          </div>

          <a href="/" className="text-sm text-zinc-500 transition hover:text-zinc-300">
            {text.backHome}
          </a>
        </div>
      </main>
    );
  }

  if (viewState === "duplicate" && data) {
    const { product } = data;
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <LanguageSwitch />
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-3 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-orange-300">
              <AlertTriangle className="h-9 w-9" />
            </div>
            <h1 className="text-2xl font-bold text-white">{text.duplicateTitle}</h1>
            <p className="text-sm text-zinc-400">{text.duplicateText}</p>
          </div>

          <div className="space-y-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">{text.productDetails}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">{text.serialId}</span>
                <span className="font-mono text-white">{product.serialId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">{text.product}</span>
                <span className="text-white">{product.productName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">{text.status}</span>
                <span className="font-semibold text-orange-300">{getProductStatusLabel(product.status, language)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">{text.risk}</span>
                <span className="font-semibold text-orange-300">{product.riskLevel}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            <p className="font-semibold text-zinc-300">{text.whatToDo}</p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>{text.action1}</li>
              <li>{text.action2}</li>
              <li>{text.action3}</li>
            </ul>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setViewState("success")}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              {text.viewAnyway}
            </button>
            <a href="/" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              {text.backHome}
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { product, batch, timeline, recallStatus, zkProofVerified } = data;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12">
      <LanguageSwitch />
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">{text.verifiedTitle}</h1>
          <p className="text-sm text-zinc-400">{text.verifiedText}</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{text.serialId}</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-white">{product?.serialId}</p>
            </div>
            <StatusBadge status={product?.status ?? "UNKNOWN"} recalled={recallStatus ?? false} language={language} />
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 text-sm">
            <div>
              <p className="text-xs text-zinc-500">{text.product}</p>
              <p className="mt-0.5 font-semibold text-white">{product?.productName || batch?.productName || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.manufacturer}</p>
              <p className="mt-0.5 font-semibold text-white">{product?.manufacturerName || batch?.manufacturerName || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.expiryDate}</p>
              <p className="mt-0.5 font-semibold text-white">{product?.expiryDate || batch?.expiryDate || text.unknown}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{text.zkProof}</p>
              <p className={`mt-0.5 font-semibold ${zkProofVerified ? "text-emerald-300" : "text-zinc-500"}`}>
                {zkProofVerified ? text.zkVerified : text.zkNotVerified}
              </p>
            </div>
          </div>

          {recallStatus ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {text.recallWarning}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">{text.timeline}</h2>
          </div>

          {timeline && timeline.length > 0 ? (
            timeline.map((event: any, idx: number) => (
              <TimelineItem
                key={event.id || idx}
                label={getTransferStatusLabel(event.status, language)}
                value={`${event.fromRole ?? event.from ?? text.unknown} -> ${event.toRole ?? event.to ?? text.unknown}`}
                sub={formatDate(event.createdAt || event.timestamp, language)}
                txHash={event.blockchainTx ?? event.txHash}
                first={idx === 0}
                last={idx === timeline.length - 1}
              />
            ))
          ) : (
            <p className="text-sm text-zinc-500">{text.noTimeline}</p>
          )}
        </div>

        <a href="/" className="block text-center text-sm text-zinc-500 transition hover:text-zinc-300">
          {text.backHome}
        </a>
      </div>
    </main>
  );
}

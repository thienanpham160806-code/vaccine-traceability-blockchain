"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getApiErrorMessage, verifyProduct } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

interface PageProps {
  params: Promise<{
    serialId: string;
  }>;
}

export default function VerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const t = useTranslation();
  const { language } = useLanguage();
  const [fromScan] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("from") === "scan";
  });
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifyProduct(serialId)
      .then((data) => setResult(data || null))
      .catch((err: unknown) => setError(getApiErrorMessage(err, t("Xác minh sản phẩm thất bại."))));
  }, [serialId, t]);

  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!result) return <p className="text-sm text-muted-foreground">{t("Đang xác minh...")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("Xác minh Serial")}</h1>
        <p className="text-muted-foreground">{serialId}</p>
        {fromScan ? (
          <Link href="/dashboard/scan" className="mt-3 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {t("Quét mã khác")}
          </Link>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <h2 className="text-xl font-bold">{result.product.productName}</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p><span className="font-semibold">{t("Mã lô")}:</span> {result.product.batchId}</p>
          <p><span className="font-semibold">{t("Trạng thái")}:</span> {result.product.status}</p>
          <p><span className="font-semibold">{t("Chủ sở hữu")}:</span> {result.product.currentOwner}</p>
          <p><span className="font-semibold">{t("Hạn dùng")}:</span> {result.product.expiryDate}</p>
          <p><span className="font-semibold">{t("Thu hồi")}:</span> {result.recallStatus ? t("Có") : t("Không")}</p>
          <p><span className="font-semibold">ZKP:</span> {result.zkProofVerified ? t("Đã xác minh") : t("Chưa xác minh")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <h2 className="text-xl font-bold">{t("Lịch sử")}</h2>
        <div className="mt-4 space-y-3">
          {result.timeline.map((item) => (
            <div key={item.id || item.blockchainTx} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{item.status}</p>
              <p className="text-muted-foreground">{item.fromAddress || item.sender} {language === "en" ? "to" : "đến"} {item.toAddress || item.receiver}</p>
              {(item.status === "REJECTED" || item.status === "RETURNED") && (item.rejectedReason || item.rejectionReason) ? (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <p className="font-bold">{t("Lý do từ chối")}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{item.rejectedReason || item.rejectionReason}</p>
                </div>
              ) : null}
              <p className="break-all text-xs text-muted-foreground">{item.blockchainTx}</p>
            </div>
          ))}
          {result.timeline.length === 0 ? <p className="text-sm text-muted-foreground">{t("Chưa có lệnh chuyển nào.")}</p> : null}
        </div>
      </div>
    </div>
  );
}

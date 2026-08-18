"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getApiErrorMessage, dispenseProduct, verifyProduct } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";
import { SupplyChainNodeGraph } from "@/components/trace/SupplyChainNodeGraph";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { useAccount } from "wagmi";
import { getStoredUser } from "@/lib/auth";
import { ActionSpinner } from "@/components/ui/ActionSpinner";
import { toast } from "sonner";
import { Syringe, Copy, CheckCircle } from "lucide-react";

interface PageProps {
  params: Promise<{
    serialId: string;
  }>;
}

export default function VerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const t = useTranslation();
  const { language } = useLanguage();
  const { address } = useAccount();
  const [fromScan] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("from") === "scan";
  });
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDispensing, setIsDispensing] = useState(false);
  const [patientToken, setPatientToken] = useState<string | null>(null);
  const [dispenseNote, setDispenseNote] = useState("");
  const [copied, setCopied] = useState(false);

  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const canDispense = user && (user.role === "CLINIC" || user.role === "PHARMACY" || user.role === "ADMIN");
  const isAdministered = String(result?.product.status || "").toUpperCase() === "ADMINISTERED";

  useEffect(() => {
    verifyProduct(serialId)
      .then((data) => setResult(data || null))
      .catch((err: unknown) => setError(getApiErrorMessage(err, t("Xác minh sản phẩm thất bại."))));
  }, [serialId, t]);

  const handleDispense = async () => {
    if (!canDispense || isDispensing || isAdministered) return;
    setIsDispensing(true);
    try {
      const data = await dispenseProduct(serialId, { reason: dispenseNote || undefined });
      setPatientToken(data.patientToken);
      toast.success(t("Đã dispense thành công."));
      await verifyProduct(serialId).then((data) => setResult(data || null));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t("Dispense thất bại.")));
    } finally {
      setIsDispensing(false);
    }
  };

  const copyToken = () => {
    if (patientToken) {
      navigator.clipboard.writeText(patientToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
        {isAdministered ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            Serial này đã được xác nhận là đã tiêm. QR không còn hợp lệ để gắn lên vaccine khác.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p><span className="font-semibold">{t("Mã lô")}:</span> {result.product.batchId}</p>
          <p><span className="font-semibold">{t("Trạng thái")}:</span> {result.product.status}</p>
          <p><span className="font-semibold">{t("Chủ sở hữu")}:</span> {result.product.currentOwner}</p>
          <p><span className="font-semibold">{t("Hạn dùng")}:</span> {result.product.expiryDate}</p>
          <p><span className="font-semibold">{t("Thu hồi")}:</span> {result.recallStatus ? t("Có") : t("Không")}</p>
          <p><span className="font-semibold">ZKP:</span> {result.zkProofVerified ? t("Đã xác minh") : t("Chưa xác minh")}</p>
        </div>
      </div>

      {/* Dispense Section */}
      {canDispense && !isAdministered && result.product.lotIdHash ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-emerald-700 dark:text-emerald-300">
            <Syringe className="h-5 w-5" />
            {t("Tiêm/Chủng ngừa")}
          </h3>
          {patientToken ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-100 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Token bệnh nhân (PII-free)</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all font-mono text-xs text-emerald-800 dark:text-emerald-200">{patientToken}</code>
                  <button
                    onClick={copyToken}
                    className="shrink-0 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-900 dark:text-emerald-300"
                  >
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                  Lưu token này để xác minh lịch sử tiêm/chủng ngừa.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm dark:border-emerald-500/30 dark:bg-zinc-900"
                placeholder={t("Ghi chú (tùy chọn)...")}
                value={dispenseNote}
                onChange={(e) => setDispenseNote(e.target.value)}
                rows={2}
              />
              <button
                onClick={handleDispense}
                disabled={isDispensing}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isDispensing ? <ActionSpinner label={t("Đang xử lý...")} /> : <><Syringe className="h-4 w-4" /> {t("Xác nhận tiêm/Chủng ngừa")}</>}
              </button>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Hành động này ghi Merkle proof lên blockchain và tạo token ẩn danh cho bệnh nhân.
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <h2 className="text-xl font-bold">{t("Lịch sử")}</h2>
        <div className="mt-4">
          <SupplyChainNodeGraph
            nodes={result.supplyChainNodes}
            events={result.timeline || []}
            language={language}
            emptyText={t("Chưa có lệnh chuyển nào.")}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { keccak256, toBytes, type Hex } from "viem";
import { RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { QrResultCard } from "./QrResultCard";
import { getApiErrorMessage, registerProduct, syncWalletProductRegistration } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { getZodFieldErrors, productRegistrationSchema } from "@/lib/validation";
import { emptyBytes32, getProductRegistryAddress, productRegistryAbi, toBytes32 } from "@/lib/wallet-contracts";
import { useTranslation } from "@/providers/LanguageProvider";

type RegisterProductResult = {
  txHash?: string;
  ipfsCid?: string;
  qrImage?: string;
};

function defaultExpiryDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function makeIds() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return {
    serialId: `VCN-${stamp}`,
    batchId: `BATCH-VCN-${stamp}`,
  };
}

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:bg-zinc-900 dark:focus:ring-blue-500/20";

const monoInputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:bg-zinc-900 dark:focus:ring-blue-500/20";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {children}
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}

export function ProductForm({ onSuccess }: { onSuccess?: (batchId: string, serialId: string) => void }) {
  const t = useTranslation();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [form, setForm] = useState(() => {
    const initialIds = makeIds();
    return {
    productName: "Hexaxim Vaccine",
    productType: "LOCAL",
    batchId: initialIds.batchId,
    serialId: initialIds.serialId,
    manufacturerName: "Local Manufacturer",
    expiryDate: defaultExpiryDate(),
    quantity: "1",
    docId: "IMP-DOC-001",
    importerLicense: "IMPORTER-LICENSE-DEMO",
    manufacturerId: "MFR-DEMO",
    documentExpiryDate: defaultExpiryDate(),
    salt: "demo-salt-001",
    regulatorCertificateId: "REG-CERT-DEMO",
    };
  });
  const [generatedSerial, setGeneratedSerial] = useState<string | null>(null);
  const [generatedBatch, setGeneratedBatch] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterProductResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const regenerate = () => {
    const ids = makeIds();
    setForm((prev) => ({ ...prev, ...ids }));
    setGeneratedSerial(null);
    setGeneratedBatch(null);
    setResult(null);
    setError(null);
    setFieldErrors({});
    setStatusMsg(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsed = productRegistrationSchema.safeParse(form);
    if (!parsed.success) {
      const errors = getZodFieldErrors(parsed.error);
      const message = errors.form || Object.values(errors)[0] || t("Vui lòng kiểm tra các trường đang báo lỗi.");
      setFieldErrors(errors);
      setError(message);
      toast.error(message);
      return;
    }

    const values = parsed.data;
    if (false && values.productType === "IMPORT") {
      const message = t("Sản phẩm nhập khẩu cần ZK proof. Với luồng demo hiện tại, hãy chọn sản xuất trong nước.");
      setFieldErrors({ productType: message });
      setError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMsg(t("Đang đăng ký on-chain và lưu metadata..."));

    try {
      const user = getStoredUser();
      if (user?.authMode === "wallet" && values.productType !== "IMPORT") {
        if (!address) throw new Error(t("Chưa kết nối MetaMask."));
        if (!publicClient) throw new Error(t("Chưa sẵn sàng kết nối Sepolia."));

        const serialHash = toBytes32(values.serialId);
        const batchHash = toBytes32(values.batchId);
        const metadataPayload = {
          serialId: values.serialId,
          serialHash,
          batchId: values.batchId,
          batchHash,
          productName: values.productName,
          manufacturerName: values.manufacturerName,
          manufacturerAddress: address,
          expiryDate: values.expiryDate,
          quantity: values.quantity,
          origin: "MANUFACTURED",
          createdAt: Date.now(),
        };
        const metadataHash = keccak256(toBytes(JSON.stringify(metadataPayload))) as Hex;
        const txHash = await writeContractAsync({
          address: getProductRegistryAddress(),
          abi: productRegistryAbi,
          functionName: "registerProduct",
          args: [serialHash, batchHash, metadataHash, emptyBytes32(), "0x"],
        });

        setStatusMsg(t("Đã gửi giao dịch. Đang chờ Sepolia xác nhận..."));
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        const data = await syncWalletProductRegistration({
          serialId: values.serialId,
          batchId: values.batchId,
          productName: values.productName,
          manufacturerName: values.manufacturerName,
          manufacturerAddress: address,
          expiryDate: values.expiryDate,
          origin: "MANUFACTURED",
          quantity: values.quantity,
          txHash,
        });
        setGeneratedSerial(values.serialId);
        setGeneratedBatch(values.batchId);
        setResult(data);
        setStatusMsg(t("Đăng ký thành công."));
        toast.success(t("Đã đăng ký sản phẩm."));
        onSuccess?.(values.batchId, values.serialId);
        return;
      }

      const data = await registerProduct({
        serialId: values.serialId,
        batchId: values.batchId,
        productName: values.productName,
        manufacturerName: values.manufacturerName,
        expiryDate: values.expiryDate,
        origin: values.productType === "IMPORT" ? "IMPORTED" : "MANUFACTURED",
        quantity: values.quantity,
        importDocument: values.productType === "IMPORT" ? {
          docId: values.docId || "",
          importerLicense: values.importerLicense || "",
          manufacturerId: values.manufacturerId || "",
          batchNo: values.batchId,
          documentExpiryDate: values.documentExpiryDate || "",
          salt: values.salt || "",
          regulatorCertificateId: values.regulatorCertificateId || "",
        } : undefined,
      });
      setGeneratedSerial(values.serialId);
      setGeneratedBatch(values.batchId);
      setResult(data);
      setStatusMsg(t("Đăng ký thành công."));
      toast.success(t("Đã đăng ký sản phẩm."));
      onSuccess?.(values.batchId, values.serialId);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, t("Đăng ký sản phẩm thất bại."));
      setError(message);
      toast.error(message);
      setStatusMsg(null);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <form onChange={() => setFieldErrors({})} onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h2 className="font-bold text-zinc-900">{t("Đăng ký lô vaccine mới")}</h2>
            <p className="text-xs text-zinc-500">{t("Tạo sản phẩm on-chain và sinh mã QR.")}</p>
          </div>
          <button
            type="button"
            onClick={regenerate}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3 w-3" />
            {t("Tạo ID mới")}
          </button>
        </div>

        {/* Status banner */}
        {statusMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            {statusMsg}
          </div>
        )}

        {/* Fields */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("Tên sản phẩm")}>
            <input
              className={inputCls}
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
              placeholder="Hexaxim Vaccine"
            />
          </Field>
          <Field label={t("Loại sản phẩm")}>
            <select
              className={inputCls}
              value={form.productType}
              onChange={(e) => setForm({ ...form, productType: e.target.value })}
            >
              <option value="LOCAL">{t("Sản xuất trong nước")}</option>
              <option value="IMPORT">{t("Nhập khẩu - yêu cầu ZK proof")}</option>
            </select>
          </Field>
          <Field label={t("Mã lô")}>
            <input
              className={monoInputCls}
              value={form.batchId}
              onChange={(e) => setForm({ ...form, batchId: e.target.value })}
            />
          </Field>
          <Field label="Serial ID">
            <input
              className={monoInputCls}
              value={form.serialId}
              onChange={(e) => setForm({ ...form, serialId: e.target.value })}
            />
          </Field>
          <Field label={t("Ngày hết hạn")}>
            <input
              type="date"
              className={inputCls}
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </Field>
          <Field label={t("Số lượng serial")}>
            <input
              type="number"
              min="1"
              className={inputCls}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label={t("Nhà sản xuất")}>
              <input
                className={inputCls}
                value={form.manufacturerName}
                onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })}
              />
            </Field>
          </div>
          {form.productType === "IMPORT" ? (
            <>
              <Field label="Import doc ID">
                <input className={monoInputCls} value={form.docId} onChange={(e) => setForm({ ...form, docId: e.target.value })} />
              </Field>
              <Field label="Importer license">
                <input className={monoInputCls} value={form.importerLicense} onChange={(e) => setForm({ ...form, importerLicense: e.target.value })} />
              </Field>
              <Field label="Manufacturer ID">
                <input className={monoInputCls} value={form.manufacturerId} onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })} />
              </Field>
              <Field label="Document expiry">
                <input type="date" className={inputCls} value={form.documentExpiryDate} onChange={(e) => setForm({ ...form, documentExpiryDate: e.target.value })} />
              </Field>
              <Field label="Private salt">
                <input className={monoInputCls} value={form.salt} onChange={(e) => setForm({ ...form, salt: e.target.value })} />
              </Field>
              <Field label="Regulator cert">
                <input className={monoInputCls} value={form.regulatorCertificateId} onChange={(e) => setForm({ ...form, regulatorCertificateId: e.target.value })} />
              </Field>
            </>
          ) : null}
        </div>

        {Object.keys(fieldErrors).length > 0 ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <p>{t("Vui lòng kiểm tra các trường sau:")}</p>
            <ul className="mt-1 list-disc pl-4">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  {field}: {message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-brand rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? t("Đang đăng ký...") : t("Đăng ký lô hàng")}
          </button>
          <Link
            href="/dashboard/products"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t("Danh sách sản phẩm")}
          </Link>
          {generatedSerial && (
            <Link
              href={`/dashboard/transfers/create?serialId=${encodeURIComponent(generatedSerial)}`}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
            >
              {t("Chuyển serial này")}
            </Link>
          )}
          {generatedBatch && (
            <Link
              href={`/dashboard/products/batches/${encodeURIComponent(generatedBatch)}`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
            >
              {t("Xem chi tiết lô")}
            </Link>
          )}
        </div>
      </form>

      {/* Right: QR result or placeholder */}
      {generatedSerial ? (
        <QrResultCard
          serialId={generatedSerial}
          txHash={result?.txHash}
          ipfsCid={result?.ipfsCid}
          qrImage={result?.qrImage}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <span className="text-2xl">📦</span>
          </div>
          <p className="text-sm font-semibold text-zinc-600">{t("Sau khi đăng ký")}</p>
          <p className="text-xs text-zinc-400">{t("Mã QR và link lô hàng sẽ xuất hiện tại đây.")}</p>
        </div>
      )}
    </div>
  );
}


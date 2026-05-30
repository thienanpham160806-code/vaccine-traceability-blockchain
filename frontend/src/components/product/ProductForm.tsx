"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { QrResultCard } from "./QrResultCard";
import { getApiErrorMessage, registerProduct } from "@/lib/api";
import { getZodFieldErrors, productRegistrationSchema } from "@/lib/validation";

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
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

const monoInputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

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
      const message = errors.form || Object.values(errors)[0] || "Please fix the highlighted fields.";
      setFieldErrors(errors);
      setError(message);
      toast.error(message);
      return;
    }

    const values = parsed.data;
    if (values.productType === "IMPORT") {
      const message = "Sản phẩm IMPORT cần ZK proof. Với luồng demo hiện tại, hãy chọn LOCAL.";
      setFieldErrors({ productType: message });
      setError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMsg("Đang đăng ký on-chain và lưu metadata...");

    try {
      const data = await registerProduct({
        serialId: values.serialId,
        batchId: values.batchId,
        productName: values.productName,
        manufacturerName: values.manufacturerName,
        expiryDate: values.expiryDate,
        origin: "MANUFACTURED",
        quantity: values.quantity,
      });
      setGeneratedSerial(values.serialId);
      setGeneratedBatch(values.batchId);
      setResult(data);
      setStatusMsg("Đăng ký thành công.");
      toast.success("Đã đăng ký sản phẩm.");
      onSuccess?.(values.batchId, values.serialId);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, "Đăng ký sản phẩm thất bại.");
      setError(message);
      toast.error(message);
      setStatusMsg(null);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <form onChange={() => setFieldErrors({})} onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-zinc-100 pb-4">
          <div>
            <h2 className="font-bold text-zinc-900">Đăng ký lô vaccine mới</h2>
            <p className="text-xs text-zinc-500">Tạo sản phẩm on-chain và sinh mã QR.</p>
          </div>
          <button
            type="button"
            onClick={regenerate}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            <RefreshCw className="h-3 w-3" />
            IDs mới
          </button>
        </div>

        {/* Status banner */}
        {statusMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            {statusMsg}
          </div>
        )}

        {/* Fields */}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên sản phẩm">
            <input
              className={inputCls}
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
              placeholder="Hexaxim Vaccine"
            />
          </Field>
          <Field label="Loại sản phẩm">
            <select
              className={inputCls}
              value={form.productType}
              onChange={(e) => setForm({ ...form, productType: e.target.value })}
            >
              <option value="LOCAL">Sản xuất trong nước</option>
              <option value="IMPORT">Nhập khẩu - yêu cầu ZK proof</option>
            </select>
          </Field>
          <Field label="Mã lô (Batch ID)">
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
          <Field label="Ngày hết hạn">
            <input
              type="date"
              className={inputCls}
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </Field>
          <Field label="Số lượng serial">
            <input
              type="number"
              min="1"
              className={inputCls}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Nhà sản xuất">
              <input
                className={inputCls}
                value={form.manufacturerName}
                onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })}
              />
            </Field>
          </div>
        </div>

        {Object.keys(fieldErrors).length > 0 ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <p>Vui lòng kiểm tra các trường sau:</p>
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
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
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
            {isSubmitting ? "Đang đăng ký…" : "ĐĂNG KÝ LÔ HÀNG"}
          </button>
          <Link
            href="/dashboard/products"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Danh sách sản phẩm
          </Link>
          {generatedSerial && (
            <Link
              href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(generatedSerial)}`}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Chuyển serial này
            </Link>
          )}
          {generatedBatch && (
            <Link
              href={`/dashboard/batches/${encodeURIComponent(generatedBatch)}`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Xem chi tiết lô
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
            <span className="text-2xl">📦</span>
          </div>
          <p className="text-sm font-semibold text-zinc-600">Sau khi đăng ký</p>
          <p className="text-xs text-zinc-400">mã QR và link lô hàng sẽ xuất hiện tại đây.</p>
        </div>
      )}
    </div>
  );
}

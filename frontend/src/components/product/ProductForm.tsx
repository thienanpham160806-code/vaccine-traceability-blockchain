"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { QrResultCard } from "./QrResultCard";
import { getApiErrorMessage, registerProduct } from "@/lib/api";

function defaultExpiryDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function makeDemoIds() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return {
    serialId: `VCN-UX-${stamp}`,
    batchId: `BATCH-UX-${stamp}`,
  };
}

export function ProductForm() {
  const initialIds = useMemo(makeDemoIds, []);
  const [form, setForm] = useState({
    productName: "Hexaxim Vaccine",
    productType: "LOCAL",
    batchId: initialIds.batchId,
    serialId: initialIds.serialId,
    manufacturerName: "Local Manufacturer",
    expiryDate: defaultExpiryDate(),
  });
  const [generatedSerial, setGeneratedSerial] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready. Use the generated demo IDs or edit them.");

  const regenerate = () => {
    const ids = makeDemoIds();
    setForm((current) => ({ ...current, ...ids }));
    setGeneratedSerial(null);
    setResult(null);
    setError(null);
    setStatus("Generated fresh demo batch and serial IDs.");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!form.productName.trim() || !form.batchId.trim() || !form.serialId.trim() || !form.expiryDate) {
      setError("Product name, batch ID, serial ID, and expiry date are required.");
      return;
    }

    if (form.productType === "IMPORT") {
      setError("Import flow requires importDocHash and zkpProof. Use LOCAL for the current smooth demo flow.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus("Registering product on-chain, pinning metadata, and saving Firebase state...");

    try {
      const data = await registerProduct({
        serialId: form.serialId.trim(),
        batchId: form.batchId.trim(),
        productName: form.productName.trim(),
        manufacturerName: form.manufacturerName.trim() || "Local Manufacturer",
        expiryDate: form.expiryDate,
        origin: "MANUFACTURED",
        quantity: 1,
      });
      setGeneratedSerial(form.serialId.trim());
      setResult(data);
      setStatus("Registration complete. QR, transaction hash, and next actions are available.");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to register product."));
      setStatus("Registration failed. Check backend logs and the message below.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Register Vaccine Product</h2>
            <p className="text-sm text-gray-500">Step 1: create a local demo product and QR.</p>
          </div>
          <button type="button" onClick={regenerate} className="rounded-md border px-3 py-2 text-sm font-semibold">
            Generate Demo IDs
          </button>
        </div>

        <div className="rounded-md border bg-blue-50 p-3 text-sm text-blue-800">{status}</div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Product Name</label>
            <input className="w-full rounded-md border p-2 text-sm" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Product Type</label>
            <select className="w-full rounded-md border p-2 text-sm" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })}>
              <option value="LOCAL">LOCAL - smooth demo flow</option>
              <option value="IMPORT">IMPORT - requires proof, blocked in UI</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Batch ID</label>
            <input className="w-full rounded-md border p-2 font-mono text-sm" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Serial ID</label>
            <input className="w-full rounded-md border p-2 font-mono text-sm" value={form.serialId} onChange={(e) => setForm({ ...form, serialId: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Expiry Date</label>
            <input className="w-full rounded-md border p-2 text-sm" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Manufacturer</label>
            <input className="w-full rounded-md border p-2 text-sm" value={form.manufacturerName} onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })} />
          </div>
        </div>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={isSubmitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400">
            {isSubmitting ? "Registering..." : "Register Product"}
          </button>
          <Link href="/dashboard/products" className="rounded-md border px-4 py-2 text-sm font-semibold">
            Product List
          </Link>
          {generatedSerial ? (
            <Link href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(generatedSerial)}`} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              Transfer This Serial
            </Link>
          ) : null}
        </div>
      </form>

      {generatedSerial ? (
        <QrResultCard
          serialId={generatedSerial}
          txHash={result?.txHash}
          ipfsCid={result?.ipfsCid}
          qrImage={result?.qrImage}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-gray-50 p-10 text-center text-gray-400">
          <p className="text-sm">After successful registration,</p>
          <p className="text-sm font-semibold">the QR code and next-step buttons will appear here.</p>
        </div>
      )}
    </div>
  );
}

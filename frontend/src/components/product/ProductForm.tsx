"use client";
import { useState } from "react";
import { QrResultCard } from "./QrResultCard";

export function ProductForm() {
  const [form, setForm] = useState({
    productName: "", productType: "IMPORT", batchId: "", 
    serialId: "", manufacturerName: "", expiryDate: ""
  });
  const [generatedSerial, setGeneratedSerial] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.productName.trim() || !form.batchId.trim() || !form.serialId.trim()) {
      alert("Please fill in all required fields.");
      return;
    }
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    setGeneratedSerial(form.serialId);
    setIsSubmitting(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
        <h2 className="text-xl font-bold text-gray-800 border-b pb-3">Register Vaccine Product</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Product Name</label>
            <input className="w-full border rounded-md p-2 text-sm" placeholder="Hexaxim Vaccine" onChange={e => setForm({...form, productName: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Product Type</label>
            <select className="w-full border rounded-md p-2 text-sm" value={form.productType} onChange={e => setForm({...form, productType: e.target.value})}>
              <option value="IMPORT">IMPORT</option>
              <option value="LOCAL">LOCAL</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Batch ID</label>
            <input className="w-full border rounded-md p-2 text-sm" placeholder="BATCH-VCN-2026-001" onChange={e => setForm({...form, batchId: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Serial ID</label>
            <input className="w-full border rounded-md p-2 text-sm" placeholder="VCN-2026-000001" onChange={e => setForm({...form, serialId: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Expiry Date</label>
            <input className="w-full border rounded-md p-2 text-sm" type="date" onChange={e => setForm({...form, expiryDate: e.target.value})} />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition">
          {isSubmitting ? "Registering..." : "Register Product"}
        </button>
      </div>
      {generatedSerial ? <QrResultCard serialId={generatedSerial} /> : (
        <div className="bg-gray-50 border border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-gray-400 text-center">
           <p className="text-sm">After successful registration,</p>
           <p className="text-sm font-semibold">the QR code will be generated here.</p>
        </div>
      )}
    </div>
  );
}
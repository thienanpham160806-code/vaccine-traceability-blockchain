"use client";

import { useEffect, useState } from "react";
import { createRecall, getRecalls } from "@/lib/api";

export default function RecallPage() {
  const [recalls, setRecalls] = useState<any[]>([]);
  const [batchHash, setBatchHash] = useState("");
  const [serials, setSerials] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getRecalls().then(setRecalls).catch((err) => setError(err?.response?.data?.error?.message || "Failed to load recalls."));
  };

  useEffect(load, []);

  const submit = async () => {
    setError(null);
    setMessage(null);

    try {
      const data = await createRecall({
        batchHash,
        reason,
        serials: serials.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setMessage(`Recall created: ${data.txHash}`);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Failed to create recall.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Recall</h1>
        <p className="text-muted-foreground">Recall a batch on-chain and update Firebase state.</p>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Batch Hash or Batch ID</label>
            <input className="w-full rounded-md border p-2 text-sm" value={batchHash} onChange={(e) => setBatchHash(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Reason</label>
            <input className="w-full rounded-md border p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold">Serials</label>
          <input className="w-full rounded-md border p-2 text-sm" value={serials} onChange={(e) => setSerials(e.target.value)} placeholder="VCN-001, VCN-002" />
        </div>
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {message ? <p className="break-all text-sm font-semibold text-green-700">{message}</p> : null}
        <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400" disabled={!batchHash || !reason || !serials} onClick={submit}>
          Recall Batch
        </button>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Recall History</h2>
        <div className="mt-4 space-y-3">
          {recalls.map((recall) => (
            <div className="rounded-lg border p-3 text-sm" key={recall.id || recall.batchHash}>
              <p className="break-all font-semibold">{recall.batchHash}</p>
              <p className="text-muted-foreground">{recall.reason || recall.reasonHash}</p>
              <p className="break-all text-xs text-muted-foreground">{recall.txHash || recall.blockchainTx}</p>
            </div>
          ))}
          {recalls.length === 0 ? <p className="text-sm text-muted-foreground">No recalls yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createDispute, getDisputes, getRiskFlags } from "@/lib/api";

export default function RiskDisputePage() {
  const [riskFlags, setRiskFlags] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [serialId, setSerialId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([getRiskFlags(), getDisputes()])
      .then(([riskData, disputeData]) => {
        setRiskFlags(riskData);
        setDisputes(disputeData);
      })
      .catch((err) => setError(err?.response?.data?.error?.message || "Failed to load risk/dispute data."));
  };

  useEffect(load, []);

  const submit = async () => {
    setError(null);
    setMessage(null);

    try {
      const data = await createDispute({ relatedSerialId: serialId, reason, reportedBy: "frontend-demo" });
      setMessage(`Dispute created: ${data.id}`);
      setSerialId("");
      setReason("");
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Failed to create dispute.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Risk & Dispute</h1>
        <p className="text-muted-foreground">Review risk flags and create Firebase-backed disputes.</p>
      </div>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="text-sm font-semibold text-green-700">{message}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Risk Flags</h2>
          <div className="mt-4 space-y-3">
            {riskFlags.map((flag) => (
              <div className="rounded-lg border p-3 text-sm" key={flag.id || flag.serialId}>
                <p className="break-all font-semibold">{flag.serialId}</p>
                <p className="text-muted-foreground">Level {String(flag.level || flag.riskLevel)} - {flag.reason}</p>
              </div>
            ))}
            {riskFlags.length === 0 ? <p className="text-sm text-muted-foreground">No risk flags yet.</p> : null}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Create Dispute</h2>
          <input className="w-full rounded-md border p-2 text-sm" value={serialId} onChange={(e) => setSerialId(e.target.value)} placeholder="Serial ID" />
          <textarea className="min-h-24 w-full rounded-md border p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400" disabled={!serialId || !reason} onClick={submit}>
            Submit Dispute
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Disputes</h2>
        <div className="mt-4 space-y-3">
          {disputes.map((dispute) => (
            <div className="rounded-lg border p-3 text-sm" key={dispute.id}>
              <p className="font-semibold">{dispute.id} - {dispute.status}</p>
              <p className="break-all text-muted-foreground">{dispute.relatedSerialId}</p>
              <p>{dispute.reason}</p>
            </div>
          ))}
          {disputes.length === 0 ? <p className="text-sm text-muted-foreground">No disputes yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { getApiErrorMessage, verifyProduct } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";

interface PageProps {
  params: Promise<{
    serialId: string;
  }>;
}

export default function VerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifyProduct(serialId)
      .then((data) => setResult(data || null))
      .catch((err: unknown) => setError(getApiErrorMessage(err, "Failed to verify product.")));
  }, [serialId]);

  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!result) return <p className="text-sm text-muted-foreground">Loading verification...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Verify Serial</h1>
        <p className="text-muted-foreground">{serialId}</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{result.product.productName}</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p><span className="font-semibold">Batch:</span> {result.product.batchId}</p>
          <p><span className="font-semibold">Status:</span> {result.product.status}</p>
          <p><span className="font-semibold">Owner:</span> {result.product.currentOwner}</p>
          <p><span className="font-semibold">Expiry:</span> {result.product.expiryDate}</p>
          <p><span className="font-semibold">Recall:</span> {result.recallStatus ? "Yes" : "No"}</p>
          <p><span className="font-semibold">ZKP:</span> {result.zkProofVerified ? "Verified" : "Not verified"}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Timeline</h2>
        <div className="mt-4 space-y-3">
          {result.timeline.map((item) => (
            <div key={item.id || item.blockchainTx} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{item.status}</p>
              <p className="text-muted-foreground">{item.fromAddress || item.sender} to {item.toAddress || item.receiver}</p>
              <p className="break-all text-xs text-muted-foreground">{item.blockchainTx}</p>
            </div>
          ))}
          {result.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No transfers yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { api, endpoints } from "@/lib/api";

interface PageProps {
  params: Promise<{
    serialId: string;
  }>;
}

export default function ConsumerVerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(endpoints.consumerVerify(serialId))
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err?.response?.data?.error?.message || "Failed to verify product."));
  }, [serialId]);

  if (error) return <main className="p-6 text-sm font-semibold text-red-600">{error}</main>;
  if (!data) return <main className="p-6 text-sm text-muted-foreground">Loading verification...</main>;

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-3xl font-bold">Vaccine Verification</h1>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Serial ID</p>
        <p className="font-mono text-lg font-bold">{data.serialId}</p>
        <div className="mt-4 space-y-2 text-sm">
          <p><span className="font-semibold">Product:</span> {data.productName}</p>
          <p><span className="font-semibold">Status:</span> {data.status}</p>
          <p><span className="font-semibold">Recalled:</span> {data.isRecalled ? "Yes" : "No"}</p>
          <p><span className="font-semibold">Expiry:</span> {data.expiryDate}</p>
        </div>
      </div>
    </main>
  );
}

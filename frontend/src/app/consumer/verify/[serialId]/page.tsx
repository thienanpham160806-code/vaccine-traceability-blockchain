"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, endpoints } from "@/lib/api";
import type { VerifyResult } from "@/lib/types";

interface PageProps {
  params: Promise<{ serialId: string }>;
}

type ViewState = "loading" | "success" | "duplicate" | "not_found" | "error";

function TimelineItem({
  label,
  value,
  sub,
  txHash,
  first,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  txHash?: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full border-2 border-emerald-400 bg-white ${first ? "mt-0" : ""}`} />
        {!last ? <div className="w-0.5 flex-1 bg-gray-200 mt-1" /> : null}
      </div>
      <div className="pb-5 min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="font-semibold text-gray-800 text-sm">{value}</p>
        {sub ? <p className="text-xs text-gray-500 mt-0.5">{sub}</p> : null}
        {txHash ? (
          <p className="font-mono text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{txHash}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status, recalled }: { status: string; recalled: boolean }) {
  if (recalled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        RECALLED
      </span>
    );
  }
  const map: Record<string, string> = {
    VERIFIED: "bg-emerald-100 text-emerald-700",
    DELIVERED: "bg-blue-100 text-blue-700",
    PENDING_DELIVERY: "bg-yellow-100 text-yellow-700",
    FLAGGED: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {status}
    </span>
  );
}

export default function ConsumerVerifyPage({ params }: PageProps) {
  const { serialId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<VerifyResult | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [retryId, setRetryId] = useState("");

  useEffect(() => {
    if (!serialId) return;
    setViewState("loading");

    api
      .get(endpoints.consumerVerify(decodeURIComponent(serialId)))
      .then((res) => {
        const result: VerifyResult = res.data.data;
        if (!result?.product) {
          setViewState("not_found");
          return;
        }
        // Check risk flags on the timeline for DOUBLE_SCAN pattern
        const hasDuplicateScan = result.product.riskLevel === "HIGH" || result.product.riskLevel === "ALERT";
        if (hasDuplicateScan && result.product.status === "FLAGGED") {
          setData(result);
          setViewState("duplicate");
        } else {
          setData(result);
          setViewState("success");
        }
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) {
          setViewState("not_found");
        } else {
          setViewState("error");
        }
      });
  }, [serialId]);

  const goRetry = () => {
    if (retryId.trim()) {
      router.push(`/consumer/verify/${encodeURIComponent(retryId.trim())}`);
    }
  };

  // ============= Loading =============
  if (viewState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Verifying on blockchain…</p>
        </div>
      </main>
    );
  }

  // ============= Not Found =============
  if (viewState === "not_found" || viewState === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-4xl">
            ❓
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Product Not Found</h1>
            <p className="text-sm text-zinc-400">
              No vaccine record matches{" "}
              <span className="font-mono text-zinc-300">{decodeURIComponent(serialId)}</span>.
            </p>
            <p className="text-sm text-zinc-500">
              Make sure the QR code or serial ID is correct and the product has been registered.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <p className="text-xs text-zinc-500">Try another serial ID</p>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={retryId}
                onChange={(e) => setRetryId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goRetry()}
                placeholder="Enter serial ID…"
              />
              <button
                onClick={goRetry}
                disabled={!retryId.trim()}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Verify
              </button>
            </div>
          </div>

          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition">← Back to home</a>
        </div>
      </main>
    );
  }

  // ============= Duplicate Scan Warning =============
  if (viewState === "duplicate" && data) {
    const { product } = data;
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-4xl">
              ⚠️
            </div>
            <h1 className="text-2xl font-bold text-white">Suspicious Scan Detected</h1>
            <p className="text-sm text-zinc-400">
              This vaccine has been flagged for an abnormal scan pattern. It may have been scanned at an unexpected location.
            </p>
          </div>

          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 space-y-3">
            <p className="text-xs text-orange-400 uppercase tracking-wide font-semibold">Product Details</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Serial ID</span>
                <span className="font-mono text-white">{product.serialId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Product</span>
                <span className="text-white">{product.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Status</span>
                <span className="text-orange-400 font-semibold">{product.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Risk</span>
                <span className="text-orange-400 font-semibold">{product.riskLevel}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400 space-y-2">
            <p className="font-semibold text-zinc-300">What to do:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Do not administer this vaccine without further verification</li>
              <li>Contact the distributor or clinic for clarification</li>
              <li>Report a dispute if you suspect tampering</li>
            </ul>
          </div>

          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => setViewState("success")}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              View Full Details Anyway
            </button>
            <a href="/" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Back to Home
            </a>
          </div>
        </div>
      </main>
    );
  }

  // ============= Success =============
  if (!data) return null;
  const { product, batch, timeline, recallStatus, zkProofVerified } = data as any;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl mx-auto">
            ✅
          </div>
          <h1 className="text-2xl font-bold text-white">Vaccine Verified</h1>
          <p className="text-sm text-zinc-400">
            This vaccine is authentic and traceable on the blockchain.
          </p>
        </div>

        {/* Product card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Serial ID</p>
              <p className="font-mono text-sm font-bold text-white mt-0.5">
                {product?.serialId}
              </p>
            </div>
            <StatusBadge
              status={product?.status ?? "UNKNOWN"}
              recalled={recallStatus ?? false}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm border-t border-zinc-800 pt-4">
            <div>
              <p className="text-xs text-zinc-500">Product</p>
              <p className="text-white font-semibold mt-0.5">{product?.productName}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Manufacturer</p>
              <p className="text-white font-semibold mt-0.5">{product?.manufacturerName}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Expiry Date</p>
              <p className="text-white font-semibold mt-0.5">{product?.expiryDate}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">ZK Proof</p>
              <p className={`font-semibold mt-0.5 ${zkProofVerified ? "text-emerald-400" : "text-zinc-500"}`}>
                {zkProofVerified ? "Verified ✓" : "Not verified"}
              </p>
            </div>
          </div>

          {recallStatus ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              ⚠️ This batch has been recalled. Do not administer.
            </div>
          ) : null}
        </div>

        {/* Supply chain timeline */}
        {timeline && timeline.length > 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wide mb-4">
              Supply Chain Timeline
            </h2>
            <div>
              {timeline.map((event: any, idx: number) => (
                <TimelineItem
                  key={event.id || idx}
                  label={event.status}
                  value={`${event.fromRole ?? event.from ?? "—"} → ${event.toRole ?? event.to ?? "—"}`}
                  sub={event.createdAt ? new Date(event.createdAt).toLocaleString() : event.timestamp}
                  txHash={event.blockchainTx ?? event.txHash}
                  first={idx === 0}
                  last={idx === timeline.length - 1}
                />
              ))}
            </div>
          </div>
        ) : null}

        <a href="/" className="block text-center text-sm text-zinc-500 hover:text-zinc-300 transition">
          ← Back to home
        </a>
      </div>
    </main>
  );
}

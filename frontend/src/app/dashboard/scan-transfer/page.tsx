"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { confirmTransfer, getApiErrorMessage, scanTransfer } from "@/lib/api";

export default function ScanTransferPage() {
  const [serialId, setSerialId] = useState("");
  const [fromRole, setFromRole] = useState("MANUFACTURER");
  const [toRole, setToRole] = useState("DISTRIBUTOR");
  const [status, setStatus] = useState("Enter or follow a serial from Product List, then create a transfer.");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSerialId(params.get("serialId") || "");
  }, []);

  const create = async () => {
    if (!serialId.trim() || isBusy) return;

    setIsBusy(true);
    setError(null);
    setStatus(`Creating ${fromRole} -> ${toRole} transfer on-chain...`);
    setTxHash(null);

    try {
      const data = await scanTransfer({ serialId: serialId.trim(), fromRole, toRole });
      setTxHash(data.txHash);
      setTransferId(data.transfer?.id || null);
      setStatus("Transfer request created. Now confirm delivery with the receiver role.");
    } catch (err: any) {
      setError(`${getApiErrorMessage(err, "Transfer creation failed.")} Common causes: product is not owned by fromRole, transfer already pending, invalid route, or Hardhat was redeployed without updating backend/.env.`);
      setStatus("Transfer creation failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const confirm = async () => {
    if (!serialId.trim() || isBusy) return;

    setIsBusy(true);
    setError(null);
    setStatus(`Confirming transfer as ${toRole}...`);
    setTxHash(null);

    try {
      const data = await confirmTransfer(serialId.trim());
      setTxHash(data.txHash);
      setTransferId(data.transferId || transferId);
      setStatus("Transfer confirmed. Verify the product to see the new owner and timeline.");
    } catch (err: any) {
      setError(`${getApiErrorMessage(err, "Transfer confirmation failed.")} Common causes: no pending transfer, wrong receiver role, or product already delivered.`);
      setStatus("Transfer confirmation failed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scan / Transfer</h1>
        <p className="text-muted-foreground">Step 2: create a delivery request and confirm it from the receiver side.</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 rounded-md border bg-blue-50 p-3 text-sm text-blue-800">{status}</div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Serial ID</label>
            <input className="w-full rounded-md border p-2 font-mono text-sm" value={serialId} onChange={(e) => setSerialId(e.target.value)} placeholder="VCN-UX-..." />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-semibold">From Role</label>
              <select className="w-full rounded-md border p-2 text-sm" value={fromRole} onChange={(e) => setFromRole(e.target.value)}>
                <option value="MANUFACTURER">MANUFACTURER</option>
                <option value="IMPORTER">IMPORTER</option>
                <option value="DISTRIBUTOR">DISTRIBUTOR</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold">To Role</label>
              <select className="w-full rounded-md border p-2 text-sm" value={toRole} onChange={(e) => setToRole(e.target.value)}>
                <option value="IMPORTER">IMPORTER</option>
                <option value="DISTRIBUTOR">DISTRIBUTOR</option>
                <option value="CLINIC">CLINIC</option>
                <option value="PHARMACY">PHARMACY</option>
              </select>
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {txHash ? (
          <div className="mt-4 rounded-md border bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">Latest transaction</p>
            <p className="break-all font-mono text-xs">{txHash}</p>
            {transferId ? <p className="mt-1 break-all text-xs">Transfer ID: {transferId}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={isBusy || !serialId} onClick={create} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400">
            {isBusy ? "Working..." : "Create Transfer"}
          </button>
          <button disabled={isBusy || !serialId} onClick={confirm} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400">
            Confirm Delivery
          </button>
          <Link href={serialId ? `/dashboard/verify/${encodeURIComponent(serialId)}` : "/dashboard/products"} className="rounded-md border px-4 py-2 text-sm font-semibold">
            Verify Product
          </Link>
          <Link href="/dashboard/products" className="rounded-md border px-4 py-2 text-sm font-semibold">
            Product List
          </Link>
        </div>
      </div>
    </div>
  );
}

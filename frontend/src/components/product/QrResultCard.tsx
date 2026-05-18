"use client";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

export function QrResultCard({
  serialId,
  txHash,
  ipfsCid,
  qrImage,
}: {
  serialId: string;
  txHash?: string;
  ipfsCid?: string;
  qrImage?: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || "http://localhost:3000/consumer/verify";
  const qrValue = `${baseUrl}/${serialId}`;

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="p-6 border-b bg-gray-50">
        <h3 className="font-bold text-lg text-gray-900">QR Code Generated</h3>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          This QR links to the public consumer verification page.
        </p>
        <div className="flex justify-center rounded-2xl bg-white border p-6">
          {qrImage ? <img src={qrImage} alt={`QR for ${serialId}`} className="h-[180px] w-[180px]" /> : <QRCodeSVG value={qrValue} size={180} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">Serial ID</p>
          <p className="text-sm text-muted-foreground font-mono">{serialId}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">QR URL</p>
          <p className="break-all text-xs text-muted-foreground font-mono">{qrValue}</p>
        </div>
        {txHash ? (
          <div>
            <p className="text-sm font-semibold text-gray-700">Transaction</p>
            <p className="break-all text-xs text-muted-foreground font-mono">{txHash}</p>
          </div>
        ) : null}
        {ipfsCid ? (
          <div>
            <p className="text-sm font-semibold text-gray-700">IPFS CID</p>
            <p className="break-all text-xs text-muted-foreground font-mono">{ipfsCid}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Link className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white" href={`/dashboard/verify/${serialId}`}>
            Verify
          </Link>
          <Link className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white" href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(serialId)}`}>
            Transfer
          </Link>
        </div>
      </div>
    </div>
  );
}

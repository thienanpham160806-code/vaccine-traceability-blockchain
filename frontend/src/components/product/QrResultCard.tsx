"use client";
import { QRCodeSVG } from "qrcode.react";

export function QrResultCard({ serialId }: { serialId: string }) {
  const qrValue = `${process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || 'https://vaccine-verify.vercel.app'}/${serialId}`;

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
          <QRCodeSVG value={qrValue} size={180} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">Serial ID</p>
          <p className="text-sm text-muted-foreground font-mono">{serialId}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">QR URL</p>
          <p className="break-all text-xs text-muted-foreground font-mono">{qrValue}</p>
        </div>
      </div>
    </div>
  );
}
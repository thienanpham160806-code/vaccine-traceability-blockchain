"use client";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useTranslation } from "@/providers/LanguageProvider";

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
  const t = useTranslation();
  const baseUrl = process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || "http://localhost:3000/consumer/verify";
  const qrValue = `${baseUrl}/${encodeURIComponent(serialId)}`;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-zinc-50 p-6">
        <h3 className="text-lg font-bold text-zinc-900">{t("Đã tạo mã QR")}</h3>
      </div>
      <div className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          {t("Mã QR này trỏ tới trang xác minh công khai cho người dùng.")}
        </p>
        <div className="flex justify-center rounded-2xl border border-zinc-200 bg-white p-6">
          <QRCodeSVG value={qrValue} size={180} />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-700">Serial ID</p>
          <p className="font-mono text-sm text-muted-foreground">{serialId}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-700">QR URL</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{qrValue}</p>
        </div>
        {txHash ? (
          <div>
            <p className="text-sm font-semibold text-zinc-700">{t("Giao dịch")}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{txHash}</p>
          </div>
        ) : null}
        {ipfsCid ? (
          <div>
            <p className="text-sm font-semibold text-zinc-700">IPFS CID</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{ipfsCid}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Link className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white" href={`/dashboard/verify/${serialId}`}>
            {t("Xác minh")}
          </Link>
          <Link className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white" href={`/dashboard/transfers/create?serialId=${encodeURIComponent(serialId)}`}>
            {t("Chuyển giao")}
          </Link>
        </div>
      </div>
    </div>
  );
}


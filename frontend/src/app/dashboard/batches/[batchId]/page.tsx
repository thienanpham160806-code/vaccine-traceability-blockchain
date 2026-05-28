"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Download, ExternalLink, QrCode, X } from "lucide-react";
import { getBatch, getBatchSerials } from "@/lib/api";
import type { Batch, Product } from "@/lib/types";

interface PageProps {
  params: Promise<{ batchId: string }>;
}

const statusChip: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING_DELIVERY: "bg-amber-50 text-amber-700 border-amber-200",
  DELIVERED: "bg-blue-50 text-blue-700 border-blue-200",
  FLAGGED: "bg-orange-50 text-orange-700 border-orange-200",
  RECALLED: "bg-red-50 text-red-700 border-red-200",
  REGISTERED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const statusLabel: Record<string, string> = {
  VERIFIED: "Đã xác thực",
  PENDING_DELIVERY: "Chờ giao",
  DELIVERED: "Đã giao",
  FLAGGED: "Bị gắn cờ",
  RECALLED: "Thu hồi",
  REGISTERED: "Đã đăng ký",
};

function QRModal({ serialId, onClose }: { serialId: string; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svgRef.current)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${serialId}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-72 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Serial QR
        </p>
        <p className="mb-4 font-mono text-xs text-zinc-700">{serialId}</p>
        <div className="flex justify-center">
          <QRCodeSVG ref={svgRef} value={serialId} size={192} level="H" includeMargin />
        </div>
        <button
          onClick={downloadSVG}
          className="btn-brand mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white"
        >
          <Download className="h-4 w-4" />
          Tải SVG
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default function BatchDetailPage({ params }: PageProps) {
  const { batchId } = use(params);
  const decoded = decodeURIComponent(batchId);
  const [qrSerial, setQrSerial] = useState<string | null>(null);

  const { data: batch, isLoading: batchLoading } = useQuery<Batch | undefined>({
    queryKey: ["batch", decoded],
    queryFn: () => getBatch(decoded),
  });

  const { data: serials = [], isLoading: serialsLoading } = useQuery<Product[]>({
    queryKey: ["batch-serials", decoded],
    queryFn: () => getBatchSerials(decoded),
  });

  if (batchLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
        ))}
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
          📦
        </div>
        <p className="font-bold text-zinc-800">Không tìm thấy lô hàng</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decoded}</p>
        <Link
          href="/dashboard/batches"
          className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
        </Link>
      </div>
    );
  }

  const statusCounts = serials.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      {qrSerial && <QRModal serialId={qrSerial} onClose={() => setQrSerial(null)} />}

      <div className="space-y-5">
        {/* Back */}
        <Link
          href="/dashboard/batches"
          className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quản lý lô hàng
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{batch.productName}</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">{batch.batchQR || batch.batchHash}</p>
          </div>
          {batch.recalledAt ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
              THU HỒI
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {batch.origin}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tổng serial" value={batch.quantity} />
          <StatCard label="Đã đăng ký" value={serials.length} />
          <StatCard label="Đã giao" value={statusCounts["DELIVERED"] ?? 0} />
          <StatCard label="Chờ giao" value={statusCounts["PENDING_DELIVERY"] ?? 0} />
        </div>

        {/* Metadata */}
        <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          {[
            { label: "Nhà sản xuất", value: batch.manufacturerName },
            { label: "Ngày hết hạn", value: batch.expiryDate },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
              <p className="mt-1 font-semibold text-zinc-800">{value}</p>
            </div>
          ))}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Địa chỉ nhà SX
            </p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-500">{batch.manufacturerAddress}</p>
          </div>
          {batch.ipfsCid && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">IPFS CID</p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-500">{batch.ipfsCid}</p>
            </div>
          )}
        </div>

        {/* Serials table */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800">
              Danh sách Serial
              {serials.length > 0 && (
                <span className="ml-2 font-normal text-zinc-400">({serials.length})</span>
              )}
            </h2>
          </div>

          {serialsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
              ))}
            </div>
          ) : serials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
              <p className="text-sm text-zinc-500">Chưa có serial nào cho lô này.</p>
              <Link
                href="/dashboard/batches"
                className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
              >
                Đăng ký sản phẩm
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr>
                    {["Serial ID", "Trạng thái", "Rủi ro", "Chủ hiện tại", "Thao tác"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {serials.map((serial) => (
                    <tr key={serial.serialId} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">{serial.serialId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            statusChip[serial.status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {statusLabel[serial.status] ?? serial.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{serial.riskLevel ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {serial.currentOwner
                          ? `${serial.currentOwner.slice(0, 6)}…${serial.currentOwner.slice(-4)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setQrSerial(serial.serialId)}
                            className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <QrCode className="h-3 w-3" /> QR
                          </button>
                          <Link
                            href={`/dashboard/verify/${encodeURIComponent(serial.serialId)}`}
                            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                          >
                            <ExternalLink className="h-3 w-3" /> Verify
                          </Link>
                          <Link
                            href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(serial.serialId)}`}
                            className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Chuyển
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

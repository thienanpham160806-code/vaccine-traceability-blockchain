"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Download, ExternalLink, QrCode, X } from "lucide-react";
import { archiveProducts, getApiErrorMessage, getBatch, getBatchSerials, getColdChainLegs, getSubLots } from "@/lib/api";
import { getConsumerVerifyQrValue } from "@/lib/qr";
import { getProductStatusLabel, getStatusChipClass } from "@/lib/status";
import type { Batch, ColdChainLeg, Product, SubLot } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";
import { getStoredUser } from "@/lib/auth";
import { canInitiateTransfer, canRegisterProducts, canViewAllScope, isAdminAuthority } from "@/lib/role-access";

interface PageProps {
  params: Promise<{ batchId: string }>;
}

function getOriginLabel(origin: string | undefined, isRecalled: boolean, t: (key: string) => string) {
  if (isRecalled) return t("Đã thu hồi");
  if (origin === "IMPORTED") return t("Nhập khẩu");
  return t("Sản xuất");
}

function QRModal({ serialId, onClose }: { serialId: string; onClose: () => void }) {
  const t = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const qrValue = getConsumerVerifyQrValue(serialId);

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
        className="relative w-72 rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
          aria-label={t("Đóng")}
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Serial QR
        </p>
        <p className="mb-4 font-mono text-xs text-zinc-700">{serialId}</p>
        <div className="qr-surface flex justify-center rounded-xl border p-3">
          <QRCodeSVG ref={svgRef} value={qrValue} size={192} level="H" includeMargin bgColor="#ffffff" fgColor="#000000" />
        </div>
        <button
          onClick={downloadSVG}
          className="btn-brand mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white"
        >
          <Download className="h-4 w-4" />
          {t("Tải SVG")}
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

function truncateHash(value?: string) {
  if (!value) return "-";
  return value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function getColdChainStatusChip(status: Batch["coldChainStatus"], t: (key: string) => string) {
  switch (status) {
    case "PASS":
      return { label: t("Đạt chuẩn"), cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "EXCURSION":
      return { label: t("Vượt ngưỡng nhiệt"), cls: "border-red-200 bg-red-50 text-red-700" };
    case "IN_TRANSIT":
      return { label: t("Đang vận chuyển"), cls: "border-blue-200 bg-blue-50 text-blue-700" };
    default:
      return { label: t("Chưa có dữ liệu"), cls: "border-zinc-200 bg-zinc-50 text-zinc-500" };
  }
}

function getLegStatusChip(status: string, t: (key: string) => string) {
  switch (status) {
    case "SEALED":
      return { label: t("Đã niêm phong"), cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "SEALING":
      return { label: t("Đang niêm phong"), cls: "border-blue-200 bg-blue-50 text-blue-700" };
    case "CLOSED_PENDING_SEAL":
      return { label: t("Chờ niêm phong"), cls: "border-amber-200 bg-amber-50 text-amber-700" };
    default:
      return { label: t("Đang mở"), cls: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  }
}

function LotMerkleSection({ batch, t }: { batch: Batch; t: (key: string) => string }) {
  const lotIdHash = batch.lotIdHash;
  const chip = getColdChainStatusChip(batch.coldChainStatus, t);

  const { data: subLots = [], isLoading: subLotsLoading } = useQuery<SubLot[]>({
    queryKey: ["sub-lots", lotIdHash],
    queryFn: () => getSubLots(lotIdHash as string),
    enabled: Boolean(lotIdHash),
  });

  const { data: legs = [], isLoading: legsLoading } = useQuery<ColdChainLeg[]>({
    queryKey: ["cold-chain-legs", lotIdHash],
    queryFn: () => getColdChainLegs(lotIdHash),
    enabled: Boolean(lotIdHash),
  });

  if (!lotIdHash) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="flex items-center justify-between sm:col-span-2">
          <h2 className="font-semibold text-zinc-800">{t("Commission on-chain (lot-Merkle)")}</h2>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
            {chip.label}
          </span>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Lot ID Hash</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500" title={lotIdHash}>
            {truncateHash(lotIdHash)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Aggregation Root</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500" title={batch.aggregationRoot}>
            {truncateHash(batch.aggregationRoot)}
          </p>
        </div>
        {typeof batch.unitCount === "number" && (
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t("Số đơn vị đã anchor")}
            </p>
            <p className="mt-1 font-semibold text-zinc-800">{batch.unitCount}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-zinc-800">
          {t("Lô con đã tách")}
          {subLots.length > 0 && <span className="ml-2 font-normal text-zinc-400">({subLots.length})</span>}
        </h2>
        {subLotsLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        ) : subLots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 py-6 text-center text-sm text-zinc-400">
            {t("Lô này chưa được tách.")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  {["Sub-lot ID", t("Số lượng"), t("Vai trò nhận"), t("Trạng thái")].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {subLots.map((sub) => (
                  <tr key={sub.subLotIdHash} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700" title={sub.subLotIdHash}>
                      {truncateHash(sub.subLotIdHash)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{sub.quantity}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{sub.toRole}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600">
                        {sub.status === "ACTIVE" ? t("Đang hoạt động") : t("Đã tiêu thụ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-zinc-800">
          {t("Chặng bảo quản lạnh")}
          {legs.length > 0 && <span className="ml-2 font-normal text-zinc-400">({legs.length})</span>}
        </h2>
        {legsLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        ) : legs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 py-6 text-center text-sm text-zinc-400">
            {t("Chưa có chặng bảo quản lạnh nào cho lô này.")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  {["Leg ID", t("Ngưỡng nhiệt"), t("Số lần đọc"), t("Vượt ngưỡng"), t("Trạng thái"), ""].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {legs.map((leg) => {
                  const legChip = getLegStatusChip(leg.status, t);
                  return (
                    <tr key={leg.legId} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700" title={leg.legId}>
                        {truncateHash(leg.legId)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {leg.thresholdMinC}°C – {leg.thresholdMaxC}°C
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{leg.readingCount}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {leg.excursionCount > 0 ? (
                          <span className="font-semibold text-red-600">{leg.excursionCount}</span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${legChip.cls}`}>
                          {legChip.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/coldchain/${encodeURIComponent(leg.legId)}`}
                          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                        >
                          <ExternalLink className="h-3 w-3" /> {t("Chi tiết")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BatchDetailPage({ params }: PageProps) {
  const { batchId } = use(params);
  const decoded = decodeURIComponent(batchId);
  const [qrSerial, setQrSerial] = useState<string | null>(null);
  const t = useTranslation();
  const { language } = useLanguage();
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const canTransfer = canInitiateTransfer(user);
  const canRegister = canRegisterProducts(user);
  const canToggleAll = canViewAllScope(user);
  const canArchive = isAdminAuthority(user);
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const { data: batch, isLoading: batchLoading } = useQuery<Batch | undefined>({
    queryKey: ["batch", decoded, scope],
    queryFn: () => getBatch(decoded, { scope }),
  });

  const { data: serials = [], isLoading: serialsLoading } = useQuery<Product[]>({
    queryKey: ["batch-serials", decoded, scope],
    queryFn: () => getBatchSerials(decoded, { scope }),
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
          <span aria-hidden="true">□</span>
        </div>
        <p className="font-bold text-zinc-800">{t("Không tìm thấy lô hàng")}</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decoded}</p>
        <Link
          href="/dashboard/products/batches"
          className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("Quay lại")}
        </Link>
      </div>
    );
  }

  const statusCounts = serials.reduce<Record<string, number>>((acc, serial) => {
    acc[serial.status] = (acc[serial.status] || 0) + 1;
    return acc;
  }, {});
  const isRecalled = !!batch.recalledAt;
  const transferableSerials = serials.filter((serial) =>
    !serial.archivedAt &&
    ["REGISTERED", "VERIFIED", "DELIVERED", "DELIVERED_TO_DISTRIBUTOR", "DELIVERED_TO_CLINIC", "DELIVERED_TO_PHARMACY"].includes(serial.status) &&
    !/^BATCH[-_:]/i.test(serial.serialId) &&
    serial.serialId.toLowerCase() !== decoded.toLowerCase() &&
    (serial.syncStatus || "OK") === "OK" &&
    Boolean(serial.blockchainTx)
  );

  const archiveBatch = async () => {
    const reason = window.prompt(t("Nhập lý do ẩn lô khỏi web. Dữ liệu on-chain sẽ không bị xóa."), "");
    if (reason === null) return;
    if (!window.confirm(t("Xác nhận ẩn lô và các serial trong lô khỏi web? Blockchain không bị thay đổi."))) return;

    try {
      await archiveProducts({ batchIds: [decoded], reason: reason.trim(), mode: "INVALIDATE" });
      toast.success(t("Đã ẩn lô khỏi web."));
      window.location.href = "/dashboard/products/batches";
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t("Không thể ẩn lô.")));
    }
  };

  return (
    <>
      {qrSerial && <QRModal serialId={qrSerial} onClose={() => setQrSerial(null)} />}

      <div className="space-y-5">
        <Link
          href="/dashboard/products/batches"
          className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("Quản lý lô hàng")}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{batch.productName}</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">{batch.batchQR || batch.batchHash}</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              isRecalled
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {getOriginLabel(batch.origin, isRecalled, t)}
          </span>
          {canArchive ? (
            <button
              type="button"
              onClick={archiveBatch}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              {t("Ẩn khỏi web")}
            </button>
          ) : null}
        </div>

        {canToggleAll ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm">
            <span className="font-semibold text-blue-800">{t("Phạm vi hiển thị")}</span>
            <div className="flex rounded-lg border border-blue-200 bg-white p-1">
              {(["mine", "all"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  className={`min-h-8 rounded-md px-3 text-xs font-bold ${scope === option ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-50"}`}
                >
                  {option === "mine" ? t("Của tôi") : t("Toàn hệ thống")}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("Tổng serial")} value={batch.quantity} />
          <StatCard label={t("Đã đăng ký")} value={serials.length} />
          <StatCard label={t("Đã giao")} value={statusCounts.DELIVERED ?? 0} />
          <StatCard label={t("Chờ giao")} value={statusCounts.PENDING_DELIVERY ?? 0} />
        </div>

        <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          {[
            { label: t("Nhà sản xuất"), value: batch.manufacturerName },
            { label: t("Ngày hết hạn"), value: batch.expiryDate },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
              <p className="mt-1 font-semibold text-zinc-800">{value}</p>
            </div>
          ))}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              {t("Địa chỉ nhà sản xuất")}
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

        <LotMerkleSection batch={batch} t={t} />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800">
              {t("Danh sách serial")}
              {serials.length > 0 && (
                <span className="ml-2 font-normal text-zinc-400">({serials.length})</span>
              )}
            </h2>
            {canTransfer && transferableSerials.length > 0 ? (
              <Link
                href={`/dashboard/transfers/create?batchId=${encodeURIComponent(decoded)}&autoSelect=all`}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                {t("Chuyển cả lô")}
              </Link>
            ) : null}
          </div>

          {serialsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
              ))}
            </div>
          ) : serials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
              <p className="text-sm text-zinc-500">{t("Chưa có serial nào cho lô này.")}</p>
              {canRegister ? (
                <Link
                  href="/dashboard/products/register"
                  className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
                >
                  {t("Đăng ký sản phẩm")}
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr>
                    {["Serial ID", t("Trạng thái"), t("Rủi ro"), t("Chủ hiện tại"), t("Thao tác")].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        {heading}
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
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getStatusChipClass(serial.status)}`}
                        >
                          {getProductStatusLabel(serial.status, language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{serial.riskLevel ? t(serial.riskLevel) : "-"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {serial.currentOwner
                          ? `${serial.currentOwner.slice(0, 6)}...${serial.currentOwner.slice(-4)}`
                          : "-"}
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
                            href={`/consumer/verify/${encodeURIComponent(serial.serialId)}`}
                            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                          >
                            <ExternalLink className="h-3 w-3" /> {t("Xác minh")}
                          </Link>
                          {canTransfer && transferableSerials.some((item) => item.serialId === serial.serialId) ? (
                            <Link
                              href={`/dashboard/transfers/create?serialId=${encodeURIComponent(serial.serialId)}`}
                              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              {t("Chuyển")}
                            </Link>
                          ) : null}
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

"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, ShieldCheck, Thermometer, TriangleAlert } from "lucide-react";
import { getApiErrorMessage, getColdChainLeg, sealColdChainLeg } from "@/lib/api";
import type { ColdChainLeg, ColdChainReading } from "@/lib/types";
import { getStoredUser } from "@/lib/auth";
import { canSealColdChainLeg } from "@/lib/role-access";
import { useTranslation } from "@/providers/LanguageProvider";

interface PageProps {
  params: Promise<{ legId: string }>;
}

function getTransactionUrl(hash?: string) {
  if (!hash) return null;
  const baseUrl = process.env.NEXT_PUBLIC_CHAIN_EXPLORER_BASE_URL;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/tx/${hash}` : null;
}

function TxLink({ hash }: { hash?: string }) {
  const t = useTranslation();
  if (!hash) return null;
  const url = getTransactionUrl(hash);
  if (!url) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs font-semibold text-zinc-500">
        {hash.slice(0, 10)}...{hash.slice(-8)}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {t("Mở transaction")}
    </a>
  );
}

function getLegStatusChip(status: ColdChainLeg["status"], t: (key: string) => string) {
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

function ReadingRow({ reading, min, max }: { reading: ColdChainReading; min: number; max: number }) {
  const excursion = reading.temperatureC < min || reading.temperatureC > max;
  return (
    <tr className={excursion ? "bg-red-50/70" : "hover:bg-zinc-50"}>
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
        {new Date(reading.timestamp).toLocaleString("vi-VN")}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{reading.deviceId}</td>
      <td className={`px-4 py-2.5 text-sm font-semibold ${excursion ? "text-red-700" : "text-zinc-800"}`}>
        {reading.temperatureC.toFixed(1)}°C
      </td>
      <td className="px-4 py-2.5 text-xs text-zinc-400">
        {typeof reading.humidityPct === "number" ? `${reading.humidityPct.toFixed(0)}%` : "-"}
      </td>
      <td className="px-4 py-2.5">
        {excursion ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            <TriangleAlert className="h-3 w-3" /> {`Vượt ngưỡng`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            OK
          </span>
        )}
      </td>
    </tr>
  );
}

export default function ColdChainLegDetailPage({ params }: PageProps) {
  const { legId } = use(params);
  const decoded = decodeURIComponent(legId);
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const [sealing, setSealing] = useState(false);

  const { data: leg, isLoading } = useQuery<ColdChainLeg | undefined>({
    queryKey: ["cold-chain-leg", decoded],
    queryFn: () => getColdChainLeg(decoded),
  });

  const canSeal = canSealColdChainLeg(user);

  const doSeal = async () => {
    setSealing(true);
    try {
      await sealColdChainLeg(decoded);
      toast.success(t("Đã niêm phong chặng và anchor on-chain."));
      queryClient.invalidateQueries({ queryKey: ["cold-chain-leg", decoded] });
      queryClient.invalidateQueries({ queryKey: ["cold-chain-legs"] });
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t("Không thể niêm phong chặng.")));
    } finally {
      setSealing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
        ))}
      </div>
    );
  }

  if (!leg) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
          <span aria-hidden="true">□</span>
        </div>
        <p className="font-bold text-zinc-800">{t("Không tìm thấy chặng bảo quản lạnh")}</p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decoded}</p>
        <Link
          href="/dashboard/coldchain"
          className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("Quay lại")}
        </Link>
      </div>
    );
  }

  const chip = getLegStatusChip(leg.status, t);
  const readings = leg.readings || [];
  const canSealNow = canSeal && leg.status === "CLOSED_PENDING_SEAL";

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/coldchain"
        className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("Bảo quản lạnh")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-bold text-zinc-900">{leg.legId}</h1>
          <Link
            href={`/dashboard/products/batches/${encodeURIComponent(leg.lotIdHash)}`}
            className="mt-0.5 block break-all font-mono text-xs text-blue-600 hover:underline"
          >
            {t("Xem lô")}: {leg.lotIdHash}
          </Link>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${chip.cls}`}>{chip.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-zinc-900">{leg.thresholdMinC}° – {leg.thresholdMaxC}°C</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("Ngưỡng nhiệt")}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-zinc-900">{leg.readingCount}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("Số lần đọc")}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
          <p className={`text-2xl font-bold ${leg.excursionCount > 0 ? "text-red-600" : "text-zinc-900"}`}>
            {leg.excursionCount}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("Vượt ngưỡng")}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-zinc-900">
            {leg.complianceFlag === undefined ? "-" : leg.complianceFlag ? "✓" : "✗"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("Đạt chuẩn")}</p>
        </div>
      </div>

      {leg.status === "SEALED" ? (
        <div className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 sm:col-span-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-zinc-800">{t("Đã niêm phong on-chain")}</h2>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Env Merkle Root</p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-500">{leg.envMerkleRoot}</p>
          </div>
          {leg.sealedCid ? (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">IPFS CID</p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-500">{leg.sealedCid}</p>
            </div>
          ) : null}
          {leg.anchoredTx || leg.custodyTxHash ? (
            <div>
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                {t("Giao dịch")}
              </p>
              <TxLink hash={leg.anchoredTx || leg.custodyTxHash} />
            </div>
          ) : null}
        </div>
      ) : canSealNow ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-zinc-800">{t("Sẵn sàng niêm phong")}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {t("Gom toàn bộ dữ liệu nhiệt độ thành 1 Merkle root và anchor on-chain.")}
            </p>
          </div>
          <button
            type="button"
            onClick={doSeal}
            disabled={sealing}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sealing ? t("Đang niêm phong...") : t("Niêm phong chặng")}
          </button>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 font-semibold text-zinc-800">
          {t("Nhật ký nhiệt độ")}
          {readings.length > 0 && <span className="ml-2 font-normal text-zinc-400">({readings.length})</span>}
        </h2>
        {readings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
            <Thermometer className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">{t("Chưa có dữ liệu nhiệt độ nào cho chặng này.")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  {[t("Thời gian"), t("Thiết bị"), t("Nhiệt độ"), t("Độ ẩm"), t("Trạng thái")].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {readings.map((reading) => (
                  <ReadingRow
                    key={`${reading.deviceId}-${reading.timestamp}`}
                    reading={reading}
                    min={leg.thresholdMinC}
                    max={leg.thresholdMaxC}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

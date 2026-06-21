"use client";

import { ArrowRight, Building2, ChevronDown, MapPin, PackageCheck, Snowflake, Truck } from "lucide-react";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { AppLanguage } from "@/lib/i18n";
import type { SupplyChainNode, TransferEvent, TransferRecord } from "@/lib/types";

type GraphTransfer = (TransferEvent | TransferRecord) & {
  from?: string;
  to?: string;
  fromRole?: string;
  toRole?: string;
  fromAddress?: string;
  toAddress?: string;
  sender?: string;
  receiver?: string;
  fromLocationName?: string;
  toLocationName?: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  carrierName?: string;
  vehicleId?: string;
  departedAt?: number;
  arrivedAt?: number;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureUnit?: "C" | "F";
  handlingNotes?: string;
  blockchainTx?: string;
  txHash?: string;
  ipfsCid?: string;
  fromLocationHash?: string;
  toLocationHash?: string;
  confirmedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  timestamp?: string | number;
};

function shortValue(value?: string) {
  if (!value) return "N/A";
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatDate(value: unknown, language: AppLanguage) {
  const date = typeof value === "number" ? new Date(value) : value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(language === "en" ? "en-US" : "vi-VN");
}

function formatTemp(transfer: GraphTransfer) {
  const unit = transfer.temperatureUnit || "C";
  if (transfer.temperatureMinC === undefined && transfer.temperatureMaxC === undefined) return "";
  if (transfer.temperatureMinC !== undefined && transfer.temperatureMaxC !== undefined) {
    return `${transfer.temperatureMinC} - ${transfer.temperatureMaxC} deg ${unit}`;
  }
  if (transfer.temperatureMinC !== undefined) return `>= ${transfer.temperatureMinC} deg ${unit}`;
  return `<= ${transfer.temperatureMaxC} deg ${unit}`;
}

function nodesFromTimeline(events: GraphTransfer[]): SupplyChainNode[] {
  const nodes: SupplyChainNode[] = [];
  for (const event of events || []) {
    nodes.push({
      id: `${event.id || event.blockchainTx || event.txHash || nodes.length}:from`,
      role: event.fromRole || event.from || "UNKNOWN",
      walletAddress: event.fromAddress || event.sender,
      locationName: event.fromLocationName,
      warehouseName: event.fromWarehouseName,
      departedAt: event.departedAt || event.createdAt,
      temperatureRange: formatTemp(event),
      status: event.status,
      transferId: event.id,
      carrierName: event.carrierName,
      vehicleId: event.vehicleId,
      handlingNotes: event.handlingNotes,
      technicalDetails: {
        txHash: event.txHash || event.blockchainTx,
        blockchainTx: event.blockchainTx,
        ipfsCid: event.ipfsCid,
        fromLocationHash: event.fromLocationHash,
        toLocationHash: event.toLocationHash,
        fromAddress: event.fromAddress || event.sender,
        toAddress: event.toAddress || event.receiver,
      },
    });
    nodes.push({
      id: `${event.id || event.blockchainTx || event.txHash || nodes.length}:to`,
      role: event.toRole || event.to || "UNKNOWN",
      walletAddress: event.toAddress || event.receiver,
      locationName: event.toLocationName,
      warehouseName: event.toWarehouseName,
      arrivedAt: event.arrivedAt || event.confirmedAt || event.updatedAt,
      temperatureRange: formatTemp(event),
      status: event.status,
      transferId: event.id,
      carrierName: event.carrierName,
      vehicleId: event.vehicleId,
      handlingNotes: event.handlingNotes,
      technicalDetails: {
        txHash: event.txHash || event.blockchainTx,
        blockchainTx: event.blockchainTx,
        ipfsCid: event.ipfsCid,
        fromLocationHash: event.fromLocationHash,
        toLocationHash: event.toLocationHash,
        fromAddress: event.fromAddress || event.sender,
        toAddress: event.toAddress || event.receiver,
      },
    });
  }
  return nodes;
}

function detailRows(node: SupplyChainNode) {
  const details = node.technicalDetails || {};
  return [
    ["Wallet", node.walletAddress],
    ["Transaction", details.txHash || details.blockchainTx],
    ["IPFS", details.ipfsCid],
    ["From location hash", details.fromLocationHash],
    ["To location hash", details.toLocationHash],
    ["From address", details.fromAddress],
    ["To address", details.toAddress],
  ].filter(([, value]) => Boolean(value));
}

export function SupplyChainNodeGraph({
  nodes,
  events,
  language,
  emptyText,
}: {
  nodes?: SupplyChainNode[];
  events?: GraphTransfer[];
  language: AppLanguage;
  emptyText: string;
}) {
  const visibleNodes = nodes?.length ? nodes : nodesFromTimeline(events || []);

  if (!visibleNodes.length) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {visibleNodes.map((node, index) => {
          const time = formatDate(node.arrivedAt || node.departedAt, language);
          const roleLabel = translateRole(node.role || "", language) || node.role || "Unknown";
          const organizationName = node.organizationName || node.organization?.name || shortValue(node.walletAddress);
          const detailItems = detailRows(node);

          return (
            <div key={node.id || index} className="flex items-stretch gap-3">
              <article className="flex w-72 shrink-0 flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">{roleLabel}</p>
                    <h3 className="mt-1 truncate text-sm font-bold text-zinc-950 dark:text-zinc-50">{organizationName}</h3>
                    {node.organizationCode || node.licenseNumber ? (
                      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {[node.organizationCode, node.licenseNumber].filter(Boolean).join(" | ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                    <Building2 className="h-4 w-4" />
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <p className="flex gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{node.warehouseName || node.locationName || node.addressOrRegion || "No location detail"}</span>
                      {node.addressOrRegion && node.addressOrRegion !== node.locationName ? (
                        <span className="block truncate text-zinc-400">{node.addressOrRegion}</span>
                      ) : null}
                    </span>
                  </p>
                  {node.temperatureRange ? (
                    <p className="flex items-center gap-2">
                      <Snowflake className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                      <span>{node.temperatureRange}</span>
                    </p>
                  ) : null}
                  {node.carrierName || node.vehicleId ? (
                    <p className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="truncate">{[node.carrierName, node.vehicleId].filter(Boolean).join(" | ")}</span>
                    </p>
                  ) : null}
                  {time ? (
                    <p className="flex items-center gap-2">
                      <PackageCheck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="truncate">{time}</span>
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {node.status ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {getTransferStatusLabel(node.status, language)}
                    </span>
                  ) : null}
                  {node.facilityType ? (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                      {node.facilityType}
                    </span>
                  ) : null}
                </div>

                {node.handlingNotes ? (
                  <p className="mt-3 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{node.handlingNotes}</p>
                ) : null}

                {detailItems.length ? (
                  <details className="group mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-zinc-600 dark:text-zinc-300">
                      Technical details
                      <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {detailItems.map(([label, value]) => (
                        <p key={label} className="grid grid-cols-[88px_1fr] gap-2">
                          <span className="text-zinc-400">{label}</span>
                          <span className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300" title={String(value)}>
                            {shortValue(String(value))}
                          </span>
                        </p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>

              {index < visibleNodes.length - 1 ? (
                <div className="flex w-10 shrink-0 items-center justify-center text-zinc-300 dark:text-zinc-700">
                  <ArrowRight className="h-5 w-5" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

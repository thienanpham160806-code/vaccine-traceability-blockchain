"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock, MapPin, XCircle } from "lucide-react";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { TransferEvent, TransferRecord } from "@/lib/types";
import type { AppLanguage } from "@/lib/i18n";

type TimelineEvent = (TransferEvent | TransferRecord) & {
  from?: string;
  to?: string;
  fromRole?: string;
  toRole?: string;
  fromAddress?: string;
  toAddress?: string;
  fromLocation?: string;
  fromLocationName?: string;
  fromLocationHash?: string;
  toLocation?: string;
  toLocationName?: string;
  toLocationHash?: string;
  sender?: string;
  receiver?: string;
  blockchainTx?: string;
  txHash?: string;
  dispute?: string;
  riskReason?: string;
  confirmedAt?: number;
  rejectedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  timestamp?: string | number;
};

function formatTime(value: unknown, language: AppLanguage) {
  const date = typeof value === "number" ? new Date(value) : value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return language === "en" ? "Unknown time" : "Không rõ thời gian";
  return date.toLocaleString(language === "en" ? "en-US" : "vi-VN");
}

function shortValue(value?: string) {
  if (!value) return "N/A";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function getIcon(status?: string) {
  if (status === "CONFIRMED" || status === "DELIVERED") return CheckCircle2;
  if (status === "REJECTED" || status === "RETURNED") return XCircle;
  if (status === "FLAGGED" || status === "RECALLED") return AlertTriangle;
  return Clock;
}

function getRejectionReason(event: any) {
  return event?.rejectedReason || event?.rejectionReason || event?.rejectReason || event?.reason || "";
}

export function TransferTimeline({
  events,
  currentOwner,
  language,
  emptyText,
}: {
  events: TimelineEvent[];
  currentOwner?: string;
  language: AppLanguage;
  emptyText: string;
}) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, index) => {
        const Icon = getIcon(event.status);
        const isLast = index === events.length - 1;
        const fromRole = translateRole(event.fromRole || event.from || "", language);
        const toRole = translateRole(event.toRole || event.to || "", language);
        const fromLocation = event.fromLocation || event.fromLocationName || shortValue(event.fromLocationHash);
        const toLocation = event.toLocation || event.toLocationName || shortValue(event.toLocationHash);
        const time = formatTime(event.confirmedAt || event.rejectedAt || event.updatedAt || event.createdAt || event.timestamp, language);
        const rejectionReason = getRejectionReason(event);
        const isRejected = event.status === "REJECTED" || event.status === "RETURNED";

        return (
          <div key={event.id || event.blockchainTx || event.txHash || index} className="grid grid-cols-[32px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                  isLast
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!isLast ? <div className="h-full min-h-10 w-px bg-zinc-200 dark:bg-zinc-800" /> : null}
            </div>
            <div className="pb-5">
              <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {fromRole || shortValue(event.fromAddress || event.sender)}
                    <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                    {toRole || shortValue(event.toAddress || event.receiver)}
                  </p>
                  <span
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    title={time}
                  >
                    {getTransferStatusLabel(event.status, language)}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
                  <p className="flex items-center gap-1.5" title={String(event.fromLocationHash || "")}>
                    <MapPin className="h-3.5 w-3.5" />
                    {fromLocation}
                  </p>
                  <p className="flex items-center gap-1.5" title={String(event.toLocationHash || "")}>
                    <MapPin className="h-3.5 w-3.5" />
                    {toLocation}
                  </p>
                </div>
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500" title={time}>
                  {time}
                </p>
                {isRejected && rejectionReason ? (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <p className="font-bold">{language === "en" ? "Rejection reason" : "Lý do từ chối"}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{rejectionReason}</p>
                  </div>
                ) : null}
                {currentOwner && isLast ? (
                  <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {language === "en" ? "Current node" : "Node hiện tại"}: {shortValue(currentOwner)}
                  </p>
                ) : null}
                {event.blockchainTx || event.txHash ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{event.blockchainTx || event.txHash}</p>
                ) : null}
                {event.dispute || event.riskReason ? (
                  <p className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                    {event.dispute || event.riskReason}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

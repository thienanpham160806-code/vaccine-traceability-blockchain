"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { translateRole } from "@/lib/i18n";
import { getTransferStatusLabel } from "@/lib/status";
import type { TransferEvent, TransferRecord } from "@/lib/types";
import type { AppLanguage } from "@/lib/i18n";

const ROLE_ORDER = ["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "CLINIC", "PHARMACY"];

const roleColors: Record<string, string> = {
  MANUFACTURER: "bg-blue-500",
  IMPORTER: "bg-indigo-500",
  DISTRIBUTOR: "bg-violet-500",
  CLINIC: "bg-emerald-500",
  PHARMACY: "bg-teal-500",
};

const roleLabelColors: Record<string, string> = {
  MANUFACTURER: "text-blue-700 dark:text-blue-300",
  IMPORTER: "text-indigo-700 dark:text-indigo-300",
  DISTRIBUTOR: "text-violet-700 dark:text-violet-300",
  CLINIC: "text-emerald-700 dark:text-emerald-300",
  PHARMACY: "text-teal-700 dark:text-teal-300",
};

const roleRingColors: Record<string, string> = {
  MANUFACTURER: "ring-blue-200 dark:ring-blue-500/30",
  IMPORTER: "ring-indigo-200 dark:ring-indigo-500/30",
  DISTRIBUTOR: "ring-violet-200 dark:ring-violet-500/30",
  CLINIC: "ring-emerald-200 dark:ring-emerald-500/30",
  PHARMACY: "ring-teal-200 dark:ring-teal-500/30",
};

type DiagramEvent = (TransferEvent | TransferRecord) & {
  from?: string;
  to?: string;
  fromRole?: string;
  toRole?: string;
  status?: string;
  txHash?: string;
  blockchainTx?: string;
  confirmedAt?: number;
  rejectedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  timestamp?: string | number;
};

type EdgeGroup = {
  from: string;
  to: string;
  transfers: DiagramEvent[];
};

function getRoles(e: DiagramEvent) {
  return {
    from: (e.fromRole || e.from || "") as string,
    to: (e.toRole || e.to || "") as string,
  };
}

function formatDate(v: unknown, lang: AppLanguage) {
  const d =
    typeof v === "number" ? new Date(v) : v ? new Date(String(v)) : null;
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN");
}

function EdgeStatusBadge({
  transfer,
  language,
  reverse,
}: {
  transfer: DiagramEvent;
  language: AppLanguage;
  reverse?: boolean;
}) {
  const status: string = transfer.status || "";
  const isConfirm = status === "CONFIRMED";
  const isReject = status === "REJECTED";
  const isReturn = status === "RETURNED";

  const cls = isConfirm
    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
    : isReject
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    : isReturn
    ? "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
    : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";

  const Icon = isConfirm ? CheckCircle2 : isReject || isReturn ? XCircle : Clock;
  const date = formatDate(
    transfer.confirmedAt ||
      transfer.rejectedAt ||
      transfer.updatedAt ||
      transfer.createdAt ||
      transfer.timestamp,
    language
  );

  return (
    <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {reverse ? <RotateCcw className="h-2.5 w-2.5 shrink-0" /> : <Icon className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">
        {reverse ? "← " : ""}
        {getTransferStatusLabel(status, language)}
      </span>
      {date && <span className="shrink-0 opacity-60">· {date}</span>}
    </div>
  );
}

export function SupplyChainDiagram({
  events,
  language,
  emptyText,
  currentOwner,
}: {
  events: DiagramEvent[];
  language: AppLanguage;
  emptyText: string;
  currentOwner?: string;
}) {
  const { nodes, edgeMap } = useMemo(() => {
    if (!events?.length) return { nodes: [] as string[], edgeMap: new Map<string, EdgeGroup>() };

    const roleSet = new Set<string>();
    for (const e of events) {
      const { from, to } = getRoles(e);
      if (from) roleSet.add(from);
      if (to) roleSet.add(to);
    }

    const ordered = ROLE_ORDER.filter((r) => roleSet.has(r));
    for (const r of roleSet) {
      if (!ROLE_ORDER.includes(r)) ordered.push(r);
    }

    const edgeMap = new Map<string, EdgeGroup>();
    for (const e of events) {
      const { from, to } = getRoles(e);
      if (!from || !to) continue;
      const key = `${from}→${to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from, to, transfers: [] });
      edgeMap.get(key)!.transfers.push(e);
    }

    return { nodes: ordered, edgeMap };
  }, [events]);

  if (!events?.length) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>;
  }

  // Edges between non-adjacent nodes (skip connections)
  const skipEdges = Array.from(edgeMap.values()).filter((edge) => {
    const fi = nodes.indexOf(edge.from);
    const ti = nodes.indexOf(edge.to);
    return fi !== -1 && ti !== -1 && Math.abs(fi - ti) > 1;
  });

  return (
    <div className="space-y-4">
      {/* Main horizontal diagram */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-start gap-0">
          {nodes.map((role, i) => {
            const isLast = i === nodes.length - 1;
            const nextRole = isLast ? null : nodes[i + 1];

            const dotColor = roleColors[role] || "bg-zinc-500";
            const labelColor = roleLabelColors[role] || "text-zinc-600 dark:text-zinc-400";
            const ringColor = roleRingColors[role] || "ring-zinc-200 dark:ring-zinc-700";
            const isCurrentOwner =
              currentOwner && (role === currentOwner || role.toLowerCase() === currentOwner.toLowerCase());

            const fwdEdge = nextRole ? edgeMap.get(`${role}→${nextRole}`) : null;
            const revEdge = nextRole ? edgeMap.get(`${nextRole}→${role}`) : null;

            return (
              <div key={role} className="flex items-start">
                {/* Node */}
                <div className="flex w-[88px] flex-col items-center gap-2">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full ring-4 ${dotColor} ${ringColor} shadow-sm ${
                      isCurrentOwner ? "outline outline-2 outline-offset-2 outline-blue-500" : ""
                    }`}
                  >
                    <span className="text-sm font-bold text-white">
                      {translateRole(role, language)[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <p className={`max-w-[80px] text-center text-[10px] font-bold uppercase leading-tight ${labelColor}`}>
                    {translateRole(role, language)}
                  </p>
                  {isCurrentOwner && (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                      {language === "en" ? "Current" : "Hiện tại"}
                    </span>
                  )}
                </div>

                {/* Arrow + edge transfer cards */}
                {!isLast && (
                  <div className="mx-1 mt-3.5 flex w-36 flex-col items-stretch gap-1">
                    {/* Arrow line */}
                    <div className="flex items-center">
                      <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">▶</span>
                    </div>
                    {/* Forward transfers */}
                    {fwdEdge?.transfers.map((t, ti) => (
                      <EdgeStatusBadge
                        key={t.id || t.txHash || `fwd-${ti}`}
                        transfer={t}
                        language={language}
                      />
                    ))}
                    {/* Reverse transfers (returned / sent back) */}
                    {revEdge?.transfers.map((t, ti) => (
                      <EdgeStatusBadge
                        key={t.id || t.txHash || `rev-${ti}`}
                        transfer={t}
                        language={language}
                        reverse
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Skip-connection edges (non-adjacent roles) */}
      {skipEdges.length > 0 && (
        <div className="space-y-2">
          {skipEdges.map((edge) => (
            <div
              key={`skip-${edge.from}-${edge.to}`}
              className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {translateRole(edge.from, language)} → {translateRole(edge.to, language)}
              </p>
              <div className="space-y-1">
                {edge.transfers.map((t, ti) => (
                  <EdgeStatusBadge key={ti} transfer={t} language={language} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

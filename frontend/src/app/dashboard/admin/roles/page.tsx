"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search, ShieldCheck, XCircle } from "lucide-react";
import { approveRoleRequest, getApiErrorMessage, getRoleRequests, getWalletRoles, rejectRoleRequest } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import type { RoleRequest } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function AdminRolesPage() {
  const t = useTranslation();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupAddress, setLookupAddress] = useState("");
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  const canAdmin =
    user?.role === "ADMIN" ||
    user?.role === "RECALL_AUTHORITY" ||
    user?.roles?.includes("ADMIN") ||
    user?.roles?.includes("RECALL_AUTHORITY");
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["role-requests"],
    queryFn: getRoleRequests,
    enabled: canAdmin,
  });

  const act = async (request: RoleRequest, action: "approve" | "reject") => {
    setBusyId(request.id);
    setError(null);
    try {
      if (action === "approve") await approveRoleRequest(request.id);
      else await rejectRoleRequest(request.id);
      await queryClient.invalidateQueries({ queryKey: ["role-requests"] });
    } catch (err) {
      setError(getApiErrorMessage(err, t("Không thể xử lý yêu cầu role.")));
    } finally {
      setBusyId(null);
    }
  };

  const lookup = async () => {
    if (!lookupAddress.trim()) return;
    setLookupResult(null);
    setError(null);
    try {
      const result = await getWalletRoles(lookupAddress.trim());
      setLookupResult(`${result.address}: ${(result.roles || []).join(", ") || "PUBLIC"}`);
    } catch (err) {
      setError(getApiErrorMessage(err, t("Không thể kiểm tra role ví.")));
    }
  };

  if (!canAdmin) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        {t("Bạn cần role ADMIN hoặc đơn vị thu hồi để duyệt yêu cầu cấp role.")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{t("Quản trị")}</p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t("Duyệt role MetaMask")}</h1>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
          <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          {t("Kiểm tra role ví")}
        </div>
        <div className="flex gap-2">
          <input
            value={lookupAddress}
            onChange={(event) => setLookupAddress(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && lookup()}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-500/20"
            placeholder="0x..."
          />
          <button onClick={lookup} type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
            <Search className="h-4 w-4" />
            {t("Kiểm tra")}
          </button>
        </div>
        {lookupResult ? <p className="mt-3 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">{lookupResult}</p> : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-bold text-zinc-900 dark:text-zinc-100">{t("Yêu cầu đang chờ")}</h2>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">{t("Đang tải...")}</p> : null}
          {!isLoading && requests.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("Không có yêu cầu nào.")}</p> : null}
          {requests.map((request) => (
            <article key={request.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{shortAddress(request.address)}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    request.status === "PENDING"
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                      : request.status === "APPROVED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                  }`}>
                    {request.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {translateRole(request.currentRole || "PUBLIC", language)} {"->"} {translateRole(request.requestedRole, language)}
                </p>
                {request.note ? <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{request.note}</p> : null}
                {request.txHash ? <p className="mt-2 break-all font-mono text-xs text-blue-600 dark:text-blue-300">tx: {request.txHash}</p> : null}
              </div>
              {request.status === "PENDING" ? (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    onClick={() => act(request, "approve")}
                    disabled={busyId === request.id}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {t("Duyệt")}
                  </button>
                  <button
                    onClick={() => act(request, "reject")}
                    disabled={busyId === request.id}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                  >
                    <XCircle className="h-4 w-4" />
                    {t("Từ chối")}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useAccount } from "wagmi";
import { createRoleRequest, getApiErrorMessage } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { translateRole } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const requestableRoles: Array<Exclude<UserRole, "ADMIN" | "PUBLIC">> = [
  "MANUFACTURER",
  "IMPORTER",
  "DISTRIBUTOR",
  "CLINIC",
  "PHARMACY",
  "RECALL_AUTHORITY",
];

export default function RoleRequestPage() {
  const t = useTranslation();
  const { language } = useLanguage();
  const { address: connectedAddress, isConnected } = useAccount();
  const [user] = useState(() => (typeof window === "undefined" ? null : getStoredUser()));
  const [requestedRole, setRequestedRole] = useState<(typeof requestableRoles)[number]>("DISTRIBUTOR");
  const [note, setNote] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (isBusy) return;
    if (!user?.address || !isConnected || !connectedAddress) {
      const msg = t("Hãy kết nối lại MetaMask trước khi gửi yêu cầu cấp quyền.");
      setMessage(msg);
      toast.error(msg);
      return;
    }
    if (connectedAddress.toLowerCase() !== user.address.toLowerCase()) {
      const msg = t("Ví MetaMask đang chọn không khớp với phiên đăng nhập. Vui lòng đăng nhập lại bằng ví này.");
      setMessage(msg);
      toast.error(msg);
      return;
    }

    setIsBusy(true);
    setMessage(null);
    try {
      await createRoleRequest({ requestedRole, note, walletAddress: connectedAddress });
      setMessage(t("Đã gửi yêu cầu cấp quyền. Vui lòng chờ admin duyệt."));
      toast.success(t("Đã gửi yêu cầu cấp quyền."));
    } catch (err) {
      const msg = getApiErrorMessage(err, t("Không thể gửi yêu cầu cấp quyền."));
      setMessage(msg);
      toast.error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{t("MetaMask")}</p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t("Yêu cầu cấp role")}</h1>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
          {t("Ví MetaMask của bạn vẫn đăng nhập được. Admin cần duyệt role trước khi bạn thực hiện nghiệp vụ trong dashboard.")}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{t("Ví đang đăng nhập")}</label>
            <p className="mt-1 break-all rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {user?.address || "-"}
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{t("Role muốn đăng ký")}</label>
            <select
              value={requestedRole}
              onChange={(event) => setRequestedRole(event.target.value as typeof requestedRole)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-500/20"
            >
              {requestableRoles.map((role) => (
                <option key={role} value={role}>
                  {translateRole(role, language)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{t("Ghi chú")}</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-500/20"
              placeholder={t("Thông tin đơn vị, lý do cần role...")}
            />
          </div>

          {message ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {message}
            </p>
          ) : null}

          <button
            type="button"
            disabled={isBusy || !user || !isConnected || !connectedAddress}
            onClick={submit}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isBusy ? t("Đang gửi...") : t("Gửi yêu cầu")}
          </button>
        </div>
      </section>
    </div>
  );
}

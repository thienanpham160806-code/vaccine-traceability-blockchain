"use client";

import Link from "next/link";
import { ContactFooter } from "@/components/layout/ContactFooter";
import { useTranslation } from "@/providers/LanguageProvider";

export default function ForbiddenPage() {
  const t = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 px-6 py-10 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-600">403</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{t("Không có quyền truy cập")}</h1>
        <p className="mt-3 text-sm text-gray-600">
          {t("Tài khoản của bạn không có quyền mở khu vực này.")}
        </p>
        <Link
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          href="/dashboard"
        >
          {t("Quay về dashboard")}
        </Link>
      </section>
      <ContactFooter className="w-full max-w-5xl" />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useTranslation } from "@/providers/LanguageProvider";

export default function NotFoundPage() {
  const t = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase text-zinc-400">404</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">{t("Không tìm thấy trang")}</h1>
        <p className="mt-3 text-sm text-zinc-500">
          {t("Trang bạn mở không tồn tại hoặc đường dẫn đã thay đổi.")}
        </p>
        <Link
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          href="/dashboard"
        >
          {t("Về tổng quan")}
        </Link>
      </div>
    </main>
  );
}

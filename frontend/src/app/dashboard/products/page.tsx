"use client";

import { ProductTable } from "@/components/product/ProductTable";
import Link from "next/link";
import { useTranslation } from "@/providers/LanguageProvider";

export default function ProductListPage() {
  const t = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("Danh sách sản phẩm")}</h1>
          <p className="text-muted-foreground">
            {t("Theo dõi serial vaccine, chủ sở hữu, trạng thái blockchain và mức rủi ro.")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/products/bulk"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:shadow-none dark:hover:bg-zinc-900"
          >
            {t("Đăng ký hàng loạt")}
          </Link>
          <Link
            href="/dashboard/products/register"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("Đăng ký sản phẩm")}
          </Link>
        </div>
      </div>

      <ProductTable />
    </div>
  );
}

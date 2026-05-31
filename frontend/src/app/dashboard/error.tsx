"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { useTranslation } from "@/providers/LanguageProvider";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslation();

  useEffect(() => {
    console.error("Dashboard error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        actionLabel={t("Thử lại")}
        message={t("Không tải được màn hình dashboard. Hãy thử lại hoặc quay về tổng quan.")}
        onAction={reset}
        title={t("Lỗi dashboard")}
      />
    </div>
  );
}

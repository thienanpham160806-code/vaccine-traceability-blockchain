"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        actionLabel="Retry"
        message="This dashboard view failed to load. Retry the view or return to the dashboard."
        onAction={reset}
        title="Dashboard error"
      />
    </div>
  );
}

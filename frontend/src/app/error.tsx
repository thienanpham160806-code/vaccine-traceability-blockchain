"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-xl">
        <ErrorState
          actionLabel="Reload"
          message="The application hit an unexpected error while rendering this page."
          onAction={reset}
          title="Application error"
        />
      </div>
    </main>
  );
}

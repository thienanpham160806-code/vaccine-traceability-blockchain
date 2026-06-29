"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DisputesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/risk-dispute");
  }, [router]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm font-semibold text-zinc-600 shadow-sm">
      Đang chuyển sang tab Rủi ro & khiếu nại...
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const [serialId, setSerialId] = useState("");

  const openConsumerVerify = () => {
    if (serialId.trim()) {
      router.push(`/consumer/verify/${encodeURIComponent(serialId.trim())}`);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="max-w-xl text-center">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-emerald-400">
          Blockchain Vaccine Traceability
        </p>

        <h1 className="text-4xl font-bold">
          Verify vaccine origin, transfer history, and safety status.
        </h1>

        <p className="mt-4 text-zinc-400">
          B2B dashboard for manufacturers, importers, distributors, clinics,
          and auditors.
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/login">Login</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>

        <div className="mt-6 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2">
          <input
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            value={serialId}
            onChange={(event) => setSerialId(event.target.value)}
            placeholder="Enter serial for public verification"
          />
          <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold" onClick={openConsumerVerify}>
            Verify
          </button>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
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
            <Link href="/consumer/verify/VCN-2026-000001">
              Consumer Verify
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
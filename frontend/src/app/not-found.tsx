import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase text-zinc-400">404</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">Page not found</h1>
        <p className="mt-3 text-sm text-zinc-500">
          The page you opened does not exist or the route has changed.
        </p>
        <Link
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          href="/dashboard"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}

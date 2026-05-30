import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-600">403</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Access denied</h1>
        <p className="mt-3 text-sm text-gray-600">
          Your account does not have permission to open this workspace area.
        </p>
        <Link
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          href="/dashboard"
        >
          Back to Dashboard
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";

export default function NetworkErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <section className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">Network</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Backend unavailable</h1>
        <p className="mt-3 text-sm text-gray-600">
          The app could not reach the API. Check that the backend is running on port 5000, then retry.
        </p>
        <Link
          className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          href="/dashboard/products"
        >
          Retry Product List
        </Link>
      </section>
    </main>
  );
}

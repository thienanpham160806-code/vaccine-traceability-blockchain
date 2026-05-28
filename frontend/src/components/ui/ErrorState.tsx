"use client";

import Link from "next/link";

export function ErrorState({
  title = "Something went wrong",
  message,
  actionLabel = "Try again",
  onAction,
  href,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm">
      <h2 className="text-lg font-bold text-red-800">{title}</h2>
      <p className="mt-2 text-red-700">{message}</p>
      {onAction ? (
        <button
          className="mt-4 rounded-md bg-red-700 px-4 py-2 font-semibold text-white"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
      {href ? (
        <Link className="mt-4 inline-flex rounded-md bg-red-700 px-4 py-2 font-semibold text-white" href={href}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

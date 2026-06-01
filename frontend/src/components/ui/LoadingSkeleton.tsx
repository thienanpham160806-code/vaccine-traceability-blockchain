export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
      <div className="grid gap-3 border-b border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" key={index} />
        ))}
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div className="grid gap-3 p-4" key={rowIndex} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/70" key={columnIndex} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-72 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
          <div className="h-6 w-56 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="space-y-2" key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/70" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
          <div className="mx-auto h-48 w-48 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/70" />
        </div>
      </div>
    </div>
  );
}

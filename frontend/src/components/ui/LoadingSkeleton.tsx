export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="grid gap-3 border-b bg-gray-50 p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <div className="h-4 animate-pulse rounded bg-gray-200" key={index} />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div className="grid gap-3 p-4" key={rowIndex} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div className="h-4 animate-pulse rounded bg-gray-100" key={columnIndex} />
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
      <div className="h-10 w-72 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div className="h-6 w-56 animate-pulse rounded bg-gray-200" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="space-y-2" key={index}>
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mx-auto h-48 w-48 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

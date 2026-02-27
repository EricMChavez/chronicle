export default function EntriesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-zinc-800" />
      <div className="mb-6 h-8 w-64 animate-pulse rounded bg-zinc-800" />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 animate-pulse rounded-full bg-zinc-800"
          />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="mb-2 flex justify-between">
              <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800" />
            </div>
            <div className="mb-1 h-3 w-full animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EntryDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-zinc-800" />
      <div className="mb-2 flex items-center gap-3">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800" />
      </div>
      <div className="mt-6 space-y-4">
        <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
      </div>
    </div>
  );
}

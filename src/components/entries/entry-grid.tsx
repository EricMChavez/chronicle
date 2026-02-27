import { EntryCard } from "./entry-card";

interface Entry {
  id: string;
  bookId: string;
  name: string;
  type: string;
  content: string;
  firstAppearanceChapter: number;
}

interface EntryGridProps {
  entries: Entry[];
}

export function EntryGrid({ entries }: EntryGridProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-zinc-400">
          No entries found at your current reading progress.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Advance your reading progress to discover more entries, or process the
          book if you haven&apos;t already.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {entries.map((entry) => (
        <EntryCard key={entry.id} {...entry} />
      ))}
    </div>
  );
}

import Link from "next/link";

interface Connection {
  id: string;
  description: string;
  chapter: number;
  targetEntry: {
    id: string;
    name: string;
    type: string;
    firstAppearanceChapter: number;
  };
}

interface EntryConnectionsProps {
  connections: Connection[];
  bookId: string;
  currentChapter: number;
}

export function EntryConnections({
  connections,
  bookId,
  currentChapter,
}: EntryConnectionsProps) {
  // Filter: only show connections where both the connection chapter
  // and the target entry's firstAppearance are <= current progress
  const visible = connections.filter(
    (c) =>
      c.chapter <= currentChapter &&
      c.targetEntry.firstAppearanceChapter <= currentChapter
  );

  if (visible.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
        Connections
      </h3>
      <div className="space-y-2">
        {visible.map((conn) => (
          <Link
            key={conn.id}
            href={`/books/${bookId}/entries/${conn.targetEntry.id}`}
            className="block rounded-lg border border-zinc-800 p-3 transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <span className="font-medium text-amber-400">
              {conn.targetEntry.name}
            </span>
            <span className="ml-2 text-xs text-zinc-500">
              {conn.targetEntry.type}
            </span>
            <p className="mt-1 text-sm text-zinc-400">{conn.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

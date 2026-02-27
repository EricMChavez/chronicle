import Link from "next/link";

const TYPE_COLORS: Record<string, string> = {
  character: "bg-blue-900/50 text-blue-300 border-blue-800",
  location: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  event: "bg-purple-900/50 text-purple-300 border-purple-800",
  faction: "bg-orange-900/50 text-orange-300 border-orange-800",
  theme: "bg-pink-900/50 text-pink-300 border-pink-800",
  item: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  other: "bg-zinc-800/50 text-zinc-300 border-zinc-700",
};

interface EntryCardProps {
  id: string;
  bookId: string;
  name: string;
  type: string;
  content: string;
  firstAppearanceChapter: number;
}

export function EntryCard({
  id,
  bookId,
  name,
  type,
  content,
  firstAppearanceChapter,
}: EntryCardProps) {
  const colorClass = TYPE_COLORS[type] || TYPE_COLORS.other;

  // Extract the "At a Glance" or italic line for preview
  const lines = content.split("\n").filter(Boolean);
  const preview =
    lines.find((l) => l.startsWith("*") && l.endsWith("*"))?.replace(/\*/g, "") ||
    lines.find((l) => l.startsWith("## At a Glance"))
      ? lines[lines.findIndex((l) => l.startsWith("## At a Glance")) + 1]
      : lines.slice(0, 2).join(" ").slice(0, 120);

  return (
    <Link
      href={`/books/${bookId}/entries/${id}`}
      className="group block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-800/80"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-100 group-hover:text-amber-400 transition-colors">
          {name}
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
        >
          {type}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-zinc-400">{preview}</p>
      <p className="mt-2 text-xs text-zinc-600">
        First appears: Ch. {firstAppearanceChapter}
      </p>
    </Link>
  );
}

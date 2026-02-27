import { MarkdownRenderer } from "./markdown-renderer";
import { EntryConnections } from "./entry-connections";
import { SourcePopover } from "./source-popover";

interface Source {
  id: string;
  observation: string;
  excerpt: string;
  searchHint: string;
  chapter: number;
  sectionHeading: string | null;
}

interface Quote {
  id: string;
  text: string;
  speaker: string | null;
  context: string | null;
  chapter: number;
}

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

interface EntryDetailProps {
  entry: {
    id: string;
    name: string;
    type: string;
    content: string;
    aliases: string[] | null;
    firstAppearanceChapter: number;
  };
  bookId: string;
  currentChapter: number;
  sources: Source[];
  quotes: Quote[];
  connections: Connection[];
}

const TYPE_COLORS: Record<string, string> = {
  character: "bg-blue-900/50 text-blue-300 border-blue-800",
  location: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  event: "bg-purple-900/50 text-purple-300 border-purple-800",
  faction: "bg-orange-900/50 text-orange-300 border-orange-800",
  theme: "bg-pink-900/50 text-pink-300 border-pink-800",
  item: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  other: "bg-zinc-800/50 text-zinc-300 border-zinc-700",
};

export function EntryDetail({
  entry,
  bookId,
  currentChapter,
  sources,
  quotes,
  connections,
}: EntryDetailProps) {
  const colorClass = TYPE_COLORS[entry.type] || TYPE_COLORS.other;
  const visibleSources = sources.filter((s) => s.chapter <= currentChapter);
  const visibleQuotes = quotes.filter((q) => q.chapter <= currentChapter);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">{entry.name}</h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
          >
            {entry.type}
          </span>
        </div>
        {entry.aliases && entry.aliases.length > 0 && (
          <p className="mt-1 text-sm text-zinc-500">
            Also known as: {entry.aliases.join(", ")}
          </p>
        )}
      </div>

      {/* Main content */}
      <MarkdownRenderer content={entry.content} />

      {/* Source observations */}
      {visibleSources.length > 0 && (
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
            Source Observations
          </h3>
          <div className="space-y-2">
            {visibleSources.map((source) => (
              <div key={source.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-xs text-zinc-600">
                  Ch. {source.chapter}
                </span>
                <SourcePopover
                  observation={source.observation}
                  excerpt={source.excerpt}
                  searchHint={source.searchHint}
                  chapter={source.chapter}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quotes */}
      {visibleQuotes.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">
            Key Quotes
          </h3>
          <div className="space-y-3">
            {visibleQuotes.map((quote) => (
              <blockquote
                key={quote.id}
                className="border-l-2 border-amber-600 pl-4"
              >
                <p className="text-sm italic text-zinc-300">
                  &ldquo;{quote.text}&rdquo;
                </p>
                {(quote.speaker || quote.context) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {quote.speaker && <span>&mdash; {quote.speaker}</span>}
                    {quote.context && (
                      <span>
                        {quote.speaker ? " · " : ""}
                        {quote.context}
                      </span>
                    )}
                    <span className="ml-1">(Ch. {quote.chapter})</span>
                  </p>
                )}
              </blockquote>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      <EntryConnections
        connections={connections}
        bookId={bookId}
        currentChapter={currentChapter}
      />
    </div>
  );
}

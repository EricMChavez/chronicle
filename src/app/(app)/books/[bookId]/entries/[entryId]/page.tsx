import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  books,
  entries,
  entryQuotes,
  entrySources,
  readingProgress,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EntryDetail } from "@/components/entries/entry-detail";
import { ChapterSelector } from "@/components/books/chapter-selector";
import { filterContentByProgress } from "@/lib/utils/content-filter";

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ bookId: string; entryId: string }>;
}) {
  const { bookId, entryId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) notFound();

  const entry = await db.query.entries.findFirst({
    where: and(eq(entries.id, entryId), eq(entries.bookId, bookId)),
  });
  if (!entry) notFound();

  const progress = await db.query.readingProgress.findFirst({
    where: and(
      eq(readingProgress.userId, session.user.id),
      eq(readingProgress.bookId, bookId)
    ),
  });

  const currentChapter = progress?.currentChapter ?? 1;

  // Don't show entry if it hasn't appeared yet
  if (entry.firstAppearanceChapter > currentChapter) notFound();

  // Fetch related data
  const [sources, quotes, bookChapters] = await Promise.all([
    db.query.entrySources.findMany({
      where: eq(entrySources.entryId, entryId),
      orderBy: (s, { asc }) => [asc(s.chapter), asc(s.sortOrder)],
    }),
    db.query.entryQuotes.findMany({
      where: eq(entryQuotes.entryId, entryId),
      orderBy: (q, { asc }) => [asc(q.chapter)],
    }),
    db.query.chapters.findMany({
      where: eq(db._.fullSchema!.chapters.bookId, bookId),
      orderBy: (c, { asc }) => [asc(c.chapterNumber)],
      columns: { chapterNumber: true, title: true },
    }),
  ]);

  const filteredContent = filterContentByProgress(
    entry.content,
    currentChapter
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/books/${bookId}/entries`}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Back to Codex
        </Link>
        <ChapterSelector
          bookId={bookId}
          chapters={bookChapters}
          currentChapter={currentChapter}
        />
      </div>

      <EntryDetail
        entry={{ ...entry, content: filteredContent }}
        bookId={bookId}
        currentChapter={currentChapter}
        sources={sources}
        quotes={quotes}
      />
    </div>
  );
}

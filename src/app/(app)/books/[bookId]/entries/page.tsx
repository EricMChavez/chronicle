import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, chapters, readingProgress } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVisibleEntries } from "@/actions/entries";
import { EntryGrid } from "@/components/entries/entry-grid";
import { EntryTypeFilter } from "@/components/entries/entry-type-filter";
import { ChapterSelector } from "@/components/books/chapter-selector";
import { filterContentByProgress } from "@/lib/utils/content-filter";

export default async function EntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { bookId } = await params;
  const { type } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) notFound();

  const bookChapters = await db.query.chapters.findMany({
    where: eq(chapters.bookId, bookId),
    orderBy: [asc(chapters.chapterNumber)],
    columns: { chapterNumber: true, title: true },
  });

  const progress = await db.query.readingProgress.findFirst({
    where: and(
      eq(readingProgress.userId, session.user.id),
      eq(readingProgress.bookId, bookId)
    ),
  });

  const currentChapter = progress?.currentChapter ?? 1;

  const { entries } = await getVisibleEntries(bookId, {
    type: type || undefined,
  });

  // Filter entry content by progress for preview
  const filteredEntries = entries.map((entry) => ({
    ...entry,
    content: filterContentByProgress(entry.content, currentChapter),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/books/${bookId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Back to {book.title}
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">
          {book.title} &mdash; Codex
        </h1>
        <ChapterSelector
          bookId={bookId}
          chapters={bookChapters}
          currentChapter={currentChapter}
        />
      </div>

      <div className="mb-6">
        <EntryTypeFilter bookId={bookId} />
      </div>

      <EntryGrid entries={filteredEntries} />
    </div>
  );
}

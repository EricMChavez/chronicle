import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, chapters, entries, readingProgress } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChapterSelector } from "@/components/books/chapter-selector";
import { ProcessingStatus } from "@/components/books/processing-status";
import { ProcessBookButton } from "@/components/books/process-book-button";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) notFound();

  const bookChapters = await db.query.chapters.findMany({
    where: eq(chapters.bookId, bookId),
    orderBy: [asc(chapters.chapterNumber)],
    columns: { chapterNumber: true, title: true, wordCount: true },
  });

  const progress = await db.query.readingProgress.findFirst({
    where: and(
      eq(readingProgress.userId, session.user.id),
      eq(readingProgress.bookId, bookId)
    ),
  });

  const currentChapter = progress?.currentChapter ?? 1;

  const entryCount = await db.query.entries.findMany({
    where: eq(entries.bookId, bookId),
    columns: { id: true },
  });

  const totalWords = bookChapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/books"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          &larr; Back to Books
        </Link>
      </div>

      {/* Book header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-100">{book.title}</h1>
        {book.author && (
          <p className="mt-1 text-lg text-zinc-400">{book.author}</p>
        )}
        {book.description && (
          <p className="mt-3 text-sm text-zinc-500">{book.description}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-500">
          <span>{book.totalChapters} chapters</span>
          <span>{totalWords.toLocaleString()} words</span>
          {book.isbn && <span>ISBN: {book.isbn}</span>}
          {book.language && <span>Language: {book.language}</span>}
        </div>
      </div>

      {/* Reading progress */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <ChapterSelector
          bookId={bookId}
          chapters={bookChapters}
          currentChapter={currentChapter}
        />
      </div>

      {/* Processing status */}
      <div className="mb-6">
        <ProcessingStatus
          bookId={bookId}
          initialStatus={book.processingStatus}
        />
        {book.processingStatus === "pending" && (
          <div className="mt-3">
            <ProcessBookButton bookId={bookId} />
          </div>
        )}
        {book.processingStatus === "failed" && (
          <div className="mt-3">
            <ProcessBookButton bookId={bookId} label="Retry Processing" />
          </div>
        )}
      </div>

      {/* Entry link */}
      {entryCount.length > 0 && (
        <Link
          href={`/books/${bookId}/entries`}
          className="block rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-center transition-colors hover:bg-amber-950/50"
        >
          <span className="text-lg font-medium text-amber-400">
            Browse Codex
          </span>
          <p className="mt-1 text-sm text-zinc-400">
            {entryCount.length} entries available
          </p>
        </Link>
      )}

      {/* Chapter list */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-zinc-200">Chapters</h2>
        <div className="space-y-1">
          {bookChapters.map((ch) => (
            <div
              key={ch.chapterNumber}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                ch.chapterNumber <= currentChapter
                  ? "text-zinc-300"
                  : "text-zinc-600"
              }`}
            >
              <span>
                {ch.chapterNumber}. {ch.title || `Chapter ${ch.chapterNumber}`}
              </span>
              <span className="text-xs text-zinc-600">
                {ch.wordCount.toLocaleString()} words
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

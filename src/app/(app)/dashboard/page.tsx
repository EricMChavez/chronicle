import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, readingProgress } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userBooks = await db.query.books.findMany({
    where: eq(books.uploadedBy, session.user.id),
    orderBy: [desc(books.updatedAt)],
  });

  const progressRecords = await db.query.readingProgress.findMany({
    where: eq(readingProgress.userId, session.user.id),
  });

  const progressMap = new Map(
    progressRecords.map((p) => [p.bookId, p.currentChapter])
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Welcome back, {session.user.name || "Reader"}
          </p>
        </div>
        <Link
          href="/books/upload"
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
        >
          Upload Book
        </Link>
      </div>

      {userBooks.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <h2 className="mb-2 text-lg font-medium text-zinc-300">
            No books yet
          </h2>
          <p className="mb-6 text-sm text-zinc-500">
            Upload an ePub to get started with your first codex.
          </p>
          <Link
            href="/books/upload"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Upload your first book
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {userBooks.map((book) => {
            const progress = progressMap.get(book.id) ?? 0;
            const progressPct =
              book.totalChapters > 0
                ? Math.round((progress / book.totalChapters) * 100)
                : 0;

            return (
              <Link
                key={book.id}
                href={`/books/${book.id}`}
                className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-600"
              >
                <h3 className="font-medium text-zinc-100 group-hover:text-amber-400 transition-colors">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="text-sm text-zinc-500">{book.author}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-amber-600 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {progress}/{book.totalChapters}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      book.processingStatus === "completed"
                        ? "bg-green-900/50 text-green-400"
                        : book.processingStatus === "processing"
                          ? "bg-amber-900/50 text-amber-400"
                          : book.processingStatus === "failed"
                            ? "bg-red-900/50 text-red-400"
                            : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {book.processingStatus}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

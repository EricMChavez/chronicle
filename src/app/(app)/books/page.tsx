import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export default async function BooksPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userBooks = await db.query.books.findMany({
    where: eq(books.uploadedBy, session.user.id),
    orderBy: [desc(books.createdAt)],
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">My Books</h1>
        <Link
          href="/books/upload"
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
        >
          Upload Book
        </Link>
      </div>

      {userBooks.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-sm text-zinc-400">No books uploaded yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {userBooks.map((book) => (
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
              <p className="mt-2 text-xs text-zinc-600">
                {book.totalChapters} chapters
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

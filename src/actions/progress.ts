"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, readingProgress } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateReadingProgress(bookId: string, currentChapter: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Validate chapter against compiled chapters for incomplete books
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { processingStatus: true, compiledChapters: true },
  });
  if (!book) throw new Error("Book not found");

  if (
    book.processingStatus !== "completed" &&
    book.compiledChapters > 0 &&
    currentChapter > book.compiledChapters
  ) {
    throw new Error(
      `Chapter ${currentChapter} hasn't been processed yet. Entries are available through chapter ${book.compiledChapters}.`
    );
  }

  await db
    .insert(readingProgress)
    .values({
      userId: session.user.id,
      bookId,
      currentChapter,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: {
        currentChapter,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/entries`);
}

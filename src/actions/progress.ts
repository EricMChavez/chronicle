"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { readingProgress } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export async function updateReadingProgress(bookId: string, currentChapter: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

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

"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { entries, readingProgress } from "@/lib/db/schema";
import { eq, and, lte, or } from "drizzle-orm";

export async function getVisibleEntries(
  bookId: string,
  options?: { type?: string }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get user's current reading progress
  const progress = await db.query.readingProgress.findFirst({
    where: and(
      eq(readingProgress.userId, session.user.id),
      eq(readingProgress.bookId, bookId)
    ),
  });

  const currentChapter = progress?.currentChapter ?? 1;

  // Get entries that are visible at this progress point
  const conditions = [
    eq(entries.bookId, bookId),
    lte(entries.firstAppearanceChapter, currentChapter),
    or(
      eq(entries.isPublic, true),
      eq(entries.generatedBy, session.user.id)
    ),
  ];

  if (options?.type) {
    conditions.push(eq(entries.type, options.type as typeof entries.type.enumValues[number]));
  }

  const visibleEntries = await db.query.entries.findMany({
    where: and(...conditions),
    orderBy: (entries, { asc }) => [asc(entries.name)],
  });

  return { entries: visibleEntries, currentChapter };
}

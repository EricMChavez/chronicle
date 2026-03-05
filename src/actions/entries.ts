"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { entries, readingProgress } from "@/lib/db/schema";
import { eq, and, lte, or, like } from "drizzle-orm";

export async function getVisibleEntries(
  bookId: string,
  options?: { category?: string }
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

  if (options?.category) {
    // Match entries whose category starts with the given top-level category
    conditions.push(like(entries.category, `${options.category}%`));
  }

  const visibleEntries = await db.query.entries.findMany({
    where: and(...conditions),
    orderBy: (entries, { asc }) => [asc(entries.name)],
  });

  return { entries: visibleEntries, currentChapter };
}

export async function getDistinctTopLevelCategories(bookId: string): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const allEntries = await db.query.entries.findMany({
    where: and(
      eq(entries.bookId, bookId),
      or(
        eq(entries.isPublic, true),
        eq(entries.generatedBy, session.user.id)
      )
    ),
    columns: { category: true },
  });

  const topLevels = new Set<string>();
  for (const entry of allEntries) {
    const topLevel = entry.category.split(">")[0].trim();
    topLevels.add(topLevel);
  }

  return Array.from(topLevels).sort();
}

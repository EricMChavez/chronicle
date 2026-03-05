"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, chapters } from "@/lib/db/schema";
import { parseEpub } from "@/lib/epub/parser";
import { fingerprintBook } from "@/lib/epub/metadata";
import { abortProcessing } from "@/lib/processing/abort-registry";
import { eq, and, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export async function uploadBook(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file || !file.name.endsWith(".epub")) {
    throw new Error("Please upload a valid .epub file");
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File must be less than 20MB");
  }

  // Write to temp file for parsing
  const tempPath = join(tmpdir(), `chronicle-${randomUUID()}.epub`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(tempPath, buffer);

  try {
    const parsed = await parseEpub(tempPath);
    const fingerprint = fingerprintBook(parsed);

    // Check for existing book by fingerprint
    const existing = await db.query.books.findFirst({
      where: or(
        fingerprint.isbn ? eq(books.isbn, fingerprint.isbn) : undefined,
        eq(books.metadataHash, fingerprint.metadataHash),
        eq(books.contentHash, fingerprint.contentHash)
      ),
    });

    if (existing) {
      redirect(`/books/${existing.id}`);
    }

    // Create book record
    const [newBook] = await db
      .insert(books)
      .values({
        title: parsed.title,
        author: parsed.author,
        description: parsed.description,
        isbn: fingerprint.isbn,
        metadataHash: fingerprint.metadataHash,
        contentHash: fingerprint.contentHash,
        language: parsed.language,
        publisher: parsed.publisher,
        publishedDate: parsed.publishedDate,
        totalChapters: parsed.chapters.length,
        uploadedBy: session.user.id,
      })
      .returning();

    // Insert chapters
    for (let i = 0; i < parsed.chapters.length; i++) {
      const ch = parsed.chapters[i];
      await db.insert(chapters).values({
        bookId: newBook.id,
        chapterNumber: i + 1,
        title: ch.title,
        content: ch.content,
        wordCount: ch.wordCount,
      });
    }

    redirect(`/books/${newBook.id}`);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function deleteBook(bookId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const book = await db.query.books.findFirst({
    where: and(eq(books.id, bookId), eq(books.uploadedBy, session.user.id)),
    columns: { id: true, processingStatus: true },
  });

  if (!book) throw new Error("Book not found");

  if (book.processingStatus === "processing") {
    abortProcessing(bookId);
  }

  await db.delete(books).where(eq(books.id, bookId));

  redirect("/books");
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { abortProcessing } from "@/lib/processing/abort-registry";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.processingStatus !== "processing") {
    return NextResponse.json(
      { error: "Book is not currently processing" },
      { status: 409 }
    );
  }

  // Signal the abort controller — let the processing loop handle status update
  abortProcessing(bookId);

  // Fallback: if the processing loop hasn't updated status within 10s, force-set failed
  setTimeout(async () => {
    try {
      const current = await db.query.books.findFirst({
        where: eq(books.id, bookId),
      });
      if (current?.processingStatus === "processing") {
        await db
          .update(books)
          .set({
            processingStatus: "failed",
            processingError: "Cancelled by user",
            updatedAt: new Date(),
          })
          .where(eq(books.id, bookId));
      }
    } catch {
      // Best-effort fallback
    }
  }, 10_000);

  return NextResponse.json({ message: "Processing cancelled" });
}

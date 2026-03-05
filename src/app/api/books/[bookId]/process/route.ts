import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books, apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { runFullProcessing } from "@/lib/processing/book-processor";
import { createAbortController } from "@/lib/processing/abort-registry";
import type { ProviderName } from "@/lib/ai/provider";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const body = await request.json();
  const provider = (body.provider || "anthropic") as ProviderName;

  // Verify book exists
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.processingStatus === "processing") {
    return NextResponse.json(
      { error: "Book is already being processed" },
      { status: 409 }
    );
  }

  // Get user's API key for this provider
  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.userId, session.user.id),
      eq(apiKeys.provider, provider)
    ),
  });
  if (!keyRecord) {
    return NextResponse.json(
      { error: `No ${provider} API key configured. Add one in Settings.` },
      { status: 400 }
    );
  }

  // Start processing in the background using waitUntil pattern
  const abortController = createAbortController(bookId);
  const processingPromise = runFullProcessing(
    bookId,
    provider,
    {
      encryptedKey: keyRecord.encryptedKey,
      iv: keyRecord.iv,
      authTag: keyRecord.authTag,
    },
    session.user.id,
    abortController.signal
  ).catch((error) => {
    console.error("Processing failed:", error);
  });

  // Use Next.js after() if available, otherwise fire-and-forget
  try {
    const { after } = await import("next/server");
    after(() => processingPromise);
  } catch {
    // after() not available in this environment
    void processingPromise;
  }

  return NextResponse.json({
    message: "Processing started",
    bookId,
    provider,
  });
}

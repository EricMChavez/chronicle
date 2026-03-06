import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { bookId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
          clearInterval(interval);
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Controller already closed by client disconnect
        }
      };

      // Send initial status immediately
      const book = await db.query.books.findFirst({
        where: eq(books.id, bookId),
      });
      if (!book) {
        send({ error: "Book not found" });
        close();
        return;
      }

      send({
        status: book.processingStatus,
        progress: book.processingProgress,
        totalChapters: book.totalChapters,
        compiledChapters: book.compiledChapters,
        error: book.processingError,
      });

      if (
        book.processingStatus === "completed" ||
        book.processingStatus === "partial" ||
        book.processingStatus === "failed"
      ) {
        close();
        return;
      }

      const interval = setInterval(async () => {
        try {
          const book = await db.query.books.findFirst({
            where: eq(books.id, bookId),
          });

          if (!book) {
            send({ error: "Book not found" });
            close();
            return;
          }

          send({
            status: book.processingStatus,
            progress: book.processingProgress,
            totalChapters: book.totalChapters,
            compiledChapters: book.compiledChapters,
            error: book.processingError,
          });

          if (
            book.processingStatus === "completed" ||
            book.processingStatus === "partial" ||
            book.processingStatus === "failed"
          ) {
            close();
          }
        } catch {
          close();
        }
      }, 2000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

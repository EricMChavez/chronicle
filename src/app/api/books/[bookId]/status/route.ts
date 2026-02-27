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
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      let running = true;
      const interval = setInterval(async () => {
        try {
          const book = await db.query.books.findFirst({
            where: eq(books.id, bookId),
          });

          if (!book) {
            send({ error: "Book not found" });
            running = false;
            clearInterval(interval);
            controller.close();
            return;
          }

          send({
            status: book.processingStatus,
            progress: book.processingProgress,
            totalChapters: book.totalChapters,
            error: book.processingError,
          });

          if (
            book.processingStatus === "completed" ||
            book.processingStatus === "failed"
          ) {
            running = false;
            clearInterval(interval);
            controller.close();
          }
        } catch {
          if (running) {
            running = false;
            clearInterval(interval);
            controller.close();
          }
        }
      }, 2000);

      // Send initial status immediately
      const book = await db.query.books.findFirst({
        where: eq(books.id, bookId),
      });
      if (book) {
        send({
          status: book.processingStatus,
          progress: book.processingProgress,
          totalChapters: book.totalChapters,
          error: book.processingError,
        });
      }
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

import { createHash } from "crypto";
import type { ParsedBook } from "./parser";

export function computeMetadataHash(book: ParsedBook): string {
  const input = [book.title, book.author, book.publishedDate]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function computeContentHash(chapters: { content: string }[]): string {
  const hash = createHash("sha256");
  for (const ch of chapters) {
    hash.update(ch.content.slice(0, 500));
  }
  return hash.digest("hex").slice(0, 32);
}

export function fingerprintBook(
  book: ParsedBook
): { isbn: string | null; metadataHash: string; contentHash: string } {
  return {
    isbn: book.isbn,
    metadataHash: computeMetadataHash(book),
    contentHash: computeContentHash(book.chapters),
  };
}

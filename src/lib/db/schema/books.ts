import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const books = pgTable("books", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text().notNull(),
  author: text(),
  description: text(),
  coverUrl: text(),
  isbn: text(),
  metadataHash: text(),
  contentHash: text(),
  language: text(),
  publisher: text(),
  publishedDate: text(),
  totalChapters: integer().notNull().default(0),
  processingStatus: processingStatusEnum().notNull().default("pending"),
  processingProgress: integer().notNull().default(0),
  processingError: text(),
  metadata: jsonb().$type<Record<string, unknown>>(),
  uploadedBy: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const chapters = pgTable("chapters", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text()
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  chapterNumber: integer().notNull(),
  title: text(),
  content: text().notNull(),
  wordCount: integer().notNull().default(0),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

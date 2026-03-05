import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { books } from "./books";
import { users } from "./auth";

export const entries = pgTable("entries", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text()
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  name: text().notNull(),
  category: text().notNull(),
  aliases: text().array(),
  content: text().notNull(),
  firstAppearanceChapter: integer().notNull(),
  significance: integer(),
  tags: text().array(),
  isPublic: boolean().notNull().default(false),
  generatedBy: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const entryQuotes = pgTable("entry_quotes", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entryId: text()
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  text: text().notNull(),
  speaker: text(),
  context: text(),
  chapter: integer().notNull(),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const entrySources = pgTable("entry_sources", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entryId: text()
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  chapter: integer().notNull(),
  observation: text().notNull(),
  anchor: text().notNull().default(""),
  sectionHeading: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const chapterSummaries = pgTable("chapter_summaries", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text()
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  chapterNumber: integer().notNull(),
  summary: text().notNull(),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

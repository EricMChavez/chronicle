import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { books } from "./books";
import { users } from "./auth";

export const entryTypeEnum = pgEnum("entry_type", [
  "character",
  "location",
  "faction",
  "item",
  "event",
  "theme",
  "other",
]);

export const entries = pgTable("entries", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookId: text()
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  name: text().notNull(),
  type: entryTypeEnum().notNull(),
  aliases: text().array(),
  content: text().notNull(),
  firstAppearanceChapter: integer().notNull(),
  isPublic: boolean().notNull().default(false),
  generatedBy: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const entryConnections = pgTable("entry_connections", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sourceEntryId: text()
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  targetEntryId: text()
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  description: text().notNull(),
  chapter: integer().notNull(),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
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
  excerpt: text().notNull(),
  searchHint: text().notNull(),
  sectionHeading: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

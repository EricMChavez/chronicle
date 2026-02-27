import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { books } from "./books";

export const readingProgress = pgTable(
  "reading_progress",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: text()
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    currentChapter: integer().notNull().default(1),
    updatedAt: timestamp({ mode: "date" }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookId] })]
);

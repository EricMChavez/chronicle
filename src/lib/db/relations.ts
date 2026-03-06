import { relations as drizzleRelations } from "drizzle-orm";
import {
  users,
  accounts,
  sessions,
  books,
  chapters,
  chapterExtractions,
  entries,
  entryQuotes,
  entrySources,
  chapterSummaries,
  readingProgress,
  apiKeys,
} from "./schema";

export const usersRelations = drizzleRelations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  books: many(books),
  entries: many(entries),
  readingProgress: many(readingProgress),
  apiKeys: many(apiKeys),
}));

export const accountsRelations = drizzleRelations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = drizzleRelations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const booksRelations = drizzleRelations(books, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [books.uploadedBy],
    references: [users.id],
  }),
  chapters: many(chapters),
  chapterExtractions: many(chapterExtractions),
  entries: many(entries),
  chapterSummaries: many(chapterSummaries),
  readingProgress: many(readingProgress),
}));

export const chaptersRelations = drizzleRelations(chapters, ({ one }) => ({
  book: one(books, { fields: [chapters.bookId], references: [books.id] }),
}));

export const chapterExtractionsRelations = drizzleRelations(
  chapterExtractions,
  ({ one }) => ({
    book: one(books, {
      fields: [chapterExtractions.bookId],
      references: [books.id],
    }),
  })
);

export const entriesRelations = drizzleRelations(entries, ({ one, many }) => ({
  book: one(books, { fields: [entries.bookId], references: [books.id] }),
  generatedByUser: one(users, {
    fields: [entries.generatedBy],
    references: [users.id],
  }),
  quotes: many(entryQuotes),
  sources: many(entrySources),
}));

export const entryQuotesRelations = drizzleRelations(
  entryQuotes,
  ({ one }) => ({
    entry: one(entries, {
      fields: [entryQuotes.entryId],
      references: [entries.id],
    }),
  })
);

export const entrySourcesRelations = drizzleRelations(
  entrySources,
  ({ one }) => ({
    entry: one(entries, {
      fields: [entrySources.entryId],
      references: [entries.id],
    }),
  })
);

export const readingProgressRelations = drizzleRelations(
  readingProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [readingProgress.userId],
      references: [users.id],
    }),
    book: one(books, {
      fields: [readingProgress.bookId],
      references: [books.id],
    }),
  })
);

export const apiKeysRelations = drizzleRelations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const chapterSummariesRelations = drizzleRelations(
  chapterSummaries,
  ({ one }) => ({
    book: one(books, {
      fields: [chapterSummaries.bookId],
      references: [books.id],
    }),
  })
);

export const relations = {
  usersRelations,
  accountsRelations,
  sessionsRelations,
  booksRelations,
  chaptersRelations,
  chapterExtractionsRelations,
  entriesRelations,
  entryQuotesRelations,
  entrySourcesRelations,
  chapterSummariesRelations,
  readingProgressRelations,
  apiKeysRelations,
};

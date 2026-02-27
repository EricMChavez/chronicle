import { relations as drizzleRelations } from "drizzle-orm";
import {
  users,
  accounts,
  sessions,
  books,
  chapters,
  entries,
  entryConnections,
  entryQuotes,
  entrySources,
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
  entries: many(entries),
  readingProgress: many(readingProgress),
}));

export const chaptersRelations = drizzleRelations(chapters, ({ one }) => ({
  book: one(books, { fields: [chapters.bookId], references: [books.id] }),
}));

export const entriesRelations = drizzleRelations(entries, ({ one, many }) => ({
  book: one(books, { fields: [entries.bookId], references: [books.id] }),
  generatedByUser: one(users, {
    fields: [entries.generatedBy],
    references: [users.id],
  }),
  outgoingConnections: many(entryConnections, { relationName: "source" }),
  incomingConnections: many(entryConnections, { relationName: "target" }),
  quotes: many(entryQuotes),
  sources: many(entrySources),
}));

export const entryConnectionsRelations = drizzleRelations(
  entryConnections,
  ({ one }) => ({
    sourceEntry: one(entries, {
      fields: [entryConnections.sourceEntryId],
      references: [entries.id],
      relationName: "source",
    }),
    targetEntry: one(entries, {
      fields: [entryConnections.targetEntryId],
      references: [entries.id],
      relationName: "target",
    }),
  })
);

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

export const relations = {
  usersRelations,
  accountsRelations,
  sessionsRelations,
  booksRelations,
  chaptersRelations,
  entriesRelations,
  entryConnectionsRelations,
  entryQuotesRelations,
  entrySourcesRelations,
  readingProgressRelations,
  apiKeysRelations,
};

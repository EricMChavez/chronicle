import { pgTable, pgEnum, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const aiProviderEnum = pgEnum("ai_provider", [
  "anthropic",
  "openai",
]);

export const apiKeys = pgTable("api_keys", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: aiProviderEnum().notNull(),
  encryptedKey: text().notNull(),
  iv: text().notNull(),
  authTag: text().notNull(),
  label: text(),
  createdAt: timestamp({ mode: "date" }).defaultNow().notNull(),
});

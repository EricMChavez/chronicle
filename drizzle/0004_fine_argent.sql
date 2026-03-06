ALTER TABLE "books" ADD COLUMN "compiled_chapters" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_bookId_name_unique" UNIQUE("book_id","name");
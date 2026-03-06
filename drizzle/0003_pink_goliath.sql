ALTER TYPE "public"."processing_status" ADD VALUE 'partial' BEFORE 'failed';--> statement-breakpoint
CREATE TABLE "chapter_extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_extractions_bookId_chapterNumber_unique" UNIQUE("book_id","chapter_number")
);
--> statement-breakpoint
ALTER TABLE "chapter_extractions" ADD CONSTRAINT "chapter_extractions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_bookId_chapterNumber_unique" UNIQUE("book_id","chapter_number");
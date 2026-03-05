ALTER TABLE "entry_connections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "entry_connections" CASCADE;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "significance" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "chapter_summaries" DROP COLUMN "cue_questions";
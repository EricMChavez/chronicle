ALTER TABLE "entries" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "entries" RENAME COLUMN "type" TO "category";--> statement-breakpoint
DROP TYPE "public"."entry_type";

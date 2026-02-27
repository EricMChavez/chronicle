import { z } from "zod";

export const uploadBookSchema = z.object({
  file: z.instanceof(File).refine((f) => f.size <= 20 * 1024 * 1024, {
    message: "File must be less than 20MB",
  }),
});

export const updateProgressSchema = z.object({
  bookId: z.string().uuid(),
  currentChapter: z.number().int().positive(),
});

export const apiKeySchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  key: z.string().min(10, "API key is too short"),
  label: z.string().max(100).optional(),
});

export const processBookSchema = z.object({
  bookId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai"]),
});

// AI response validation schemas
export const extractionObservationSchema = z.object({
  fact: z.string(),
  excerpt: z.string(),
  searchHint: z.string(),
});

export const extractionQuoteSchema = z.object({
  text: z.string().refine(
    (t) => t.split(/\s+/).length <= 40,
    { message: "Quote must be 40 words or fewer" }
  ),
  speaker: z.string(),
  context: z.string(),
});

export const extractionConnectionSchema = z.object({
  name: z.string(),
  detail: z.string(),
});

export const extractionEntitySchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  type: z.enum(["character", "location", "faction", "item", "event", "theme", "other"]),
  observations: z.array(extractionObservationSchema),
  quotes: z.array(extractionQuoteSchema).default([]),
  connections: z.array(extractionConnectionSchema).default([]),
});

export const extractionResponseSchema = z.object({
  entities: z.array(extractionEntitySchema),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type ExtractionEntity = z.infer<typeof extractionEntitySchema>;

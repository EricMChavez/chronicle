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

// --- Range expansion utility ---

/**
 * Parses a compact range string like "1-50, 56-130" into an expanded number array.
 * Handles: single numbers ("3"), ranges ("1-50"), comma-separated mix ("3, 7, 12-15, 28").
 */
export function expandRanges(input: string, totalParagraphs?: number): number[] {
  const result: number[] = [];
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = endStr.toLowerCase() === "end" && totalParagraphs
        ? totalParagraphs
        : parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        result.push(num);
      }
    }
  }
  return result;
}

// AI response validation schemas

// Shared sub-schemas
export const extractionQuoteSchema = z.object({
  text: z.string().transform((t) => {
    const words = t.split(/\s+/);
    return words.length > 30 ? words.slice(0, 30).join(" ") + "…" : t;
  }),
  speaker: z.string().default("narrator"),
  context: z.string().default(""),
});

// Breadth-first extraction — discrete facts with search anchors
export const extractionObservationSchema = z.object({
  fact: z.string(),
  anchor: z.string().default(""),
});

// Structure discovery response (Step 2)
export function createStructureSubjectSchema(totalParagraphs?: number) {
  return z.object({
    name: z.string(),
    category: z.string(),
    status: z.enum(["new", "existing"]).default("new").catch("new"),
    paragraphs: z.union([
      z.string().transform((s) => expandRanges(s, totalParagraphs)),
      z.array(z.number().int()),
    ]).default([]).catch([]),
    significance: z.number().int().min(1).max(10).default(5).catch(5),
    tags: z.array(z.string()).default([]).catch([]),
  });
}

export function createStructureResponseSchema(totalParagraphs?: number) {
  return z.object({
    subjects: z.array(createStructureSubjectSchema(totalParagraphs)).default([]).catch([]),
  });
}

export const structureSubjectSchema = createStructureSubjectSchema();
export const structureResponseSchema = createStructureResponseSchema();

export type StructureResponse = z.infer<typeof structureResponseSchema>;
export type StructureSubject = z.infer<typeof structureSubjectSchema>;

// Detail extraction response (Step 3)
export const detailSubjectSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]).catch([]),
  summary: z.string().default("").catch(""),
  observations: z.array(extractionObservationSchema).default([]).catch([]),
  quotes: z.array(extractionQuoteSchema).default([]).catch([]),
});

export const detailResponseSchema = z.object({
  subjects: z.array(detailSubjectSchema).default([]).catch([]),
});

export type DetailResponse = z.infer<typeof detailResponseSchema>;
export type DetailSubject = z.infer<typeof detailSubjectSchema>;

// Combined extraction entity (assembled from structure + detail passes)
export const extractionEntitySchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]).catch([]),
  category: z.string(),
  significance: z.number().int().min(1).max(10).default(5).catch(5),
  tags: z.array(z.string()).default([]).catch([]),
  summary: z.string().default("").catch(""),
  observations: z.array(extractionObservationSchema).default([]).catch([]),
  quotes: z.array(extractionQuoteSchema).default([]).catch([]),
});

export type ExtractionEntity = z.infer<typeof extractionEntitySchema>;

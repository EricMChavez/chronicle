import type { ExtractionEntity } from "@/lib/utils/validation";
import { levenshtein } from "@/lib/ai/validation";

const MAX_CHAPTER_CHARS = 35_000;
const OVERLAP_CHARS = 2_000;

/**
 * Number each paragraph for structure discovery paragraph references.
 * Returns the numbered text and a map of paragraph number → original text.
 */
export function numberParagraphs(text: string): {
  numbered: string;
  paragraphs: Map<number, string>;
} {
  const parts = text.split(/\n\n+/);
  const paragraphs = new Map<number, string>();
  const numberedParts: string[] = [];

  let index = 1;
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    paragraphs.set(index, trimmed);
    numberedParts.push(`[P${index}] ${trimmed}`);
    index++;
  }

  return { numbered: numberedParts.join("\n\n"), paragraphs };
}

/**
 * Split chapter text at paragraph boundaries if it exceeds the size threshold.
 * Returns an array of text chunks (usually just one).
 */
export function splitChapter(text: string): string[] {
  if (text.length <= MAX_CHAPTER_CHARS) {
    return [text];
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHAPTER_CHARS && current.length > 0) {
      chunks.push(current);
      // Start next chunk with overlap from end of current
      const overlapStart = Math.max(0, current.length - OVERLAP_CHARS);
      current = current.slice(overlapStart) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}

interface ChunkResult {
  chapterNumber: number;
  chapterSummary: string;
  entities: ExtractionEntity[];
}

/**
 * Merge extraction results from multiple chunks of the same chapter.
 * Deduplicates entities by name (fuzzy) and merges their data.
 * Concatenates chunk summaries.
 */
export function mergeExtractionResults(
  chunkResults: ChunkResult[]
): { entities: ExtractionEntity[]; chapterSummary: string } {
  const merged = new Map<string, ExtractionEntity>();
  const threshold = 3;

  // Merge chapter summaries across chunks
  const summaries: string[] = [];
  for (const result of chunkResults) {
    if (result.chapterSummary) summaries.push(result.chapterSummary);
  }

  for (const result of chunkResults) {
    for (const entity of result.entities) {
      // Find existing entity by fuzzy name match
      let matchKey: string | undefined;
      for (const [key, existing] of merged) {
        const allNames = [existing.name, ...existing.aliases].map((n) => n.toLowerCase());
        const entityNames = [entity.name, ...entity.aliases].map((n) => n.toLowerCase());

        const isMatch = entityNames.some(
          (en) =>
            allNames.includes(en) ||
            allNames.some((an) => levenshtein(en, an) <= threshold)
        );

        if (isMatch) {
          matchKey = key;
          break;
        }
      }

      if (matchKey) {
        const existing = merged.get(matchKey)!;
        // Merge summaries
        if (entity.summary) {
          existing.summary = existing.summary
            ? `${existing.summary} ${entity.summary}`
            : entity.summary;
        }
        // Merge observations, deduplicating by fact similarity
        for (const obs of entity.observations) {
          const isDuplicate = existing.observations.some(
            (eo) => levenshtein(eo.fact.toLowerCase(), obs.fact.toLowerCase()) <= threshold
          );
          if (!isDuplicate) {
            existing.observations.push(obs);
          }
        }
        // Merge quotes, deduplicating by text
        for (const quote of entity.quotes) {
          const isDuplicate = existing.quotes.some(
            (eq) => levenshtein(eq.text.toLowerCase(), quote.text.toLowerCase()) <= threshold
          );
          if (!isDuplicate) {
            existing.quotes.push(quote);
          }
        }
        // Merge aliases
        for (const alias of entity.aliases) {
          if (!existing.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
            existing.aliases.push(alias);
          }
        }
        // Merge tags (union, deduplicate)
        for (const tag of entity.tags) {
          if (!existing.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            existing.tags.push(tag);
          }
        }
        // Significance: take the higher score
        if (entity.significance > existing.significance) {
          existing.significance = entity.significance;
        }
      } else {
        merged.set(entity.name.toLowerCase(), { ...entity });
      }
    }
  }

  return {
    entities: Array.from(merged.values()),
    chapterSummary: summaries.join(" "),
  };
}

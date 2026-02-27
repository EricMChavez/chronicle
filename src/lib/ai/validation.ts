import { extractionResponseSchema, type ExtractionResponse } from "@/lib/utils/validation";

export function validateExtractionResponse(raw: string): ExtractionResponse {
  const parsed = JSON.parse(raw);
  return extractionResponseSchema.parse(parsed);
}

export function validateQuoteLength(text: string): boolean {
  return text.split(/\s+/).length <= 40;
}

export function validateChapterMarkers(content: string): number[] {
  const markerRegex = /<!-- chapter:(\d+) -->/g;
  const chapters: number[] = [];
  let match;
  while ((match = markerRegex.exec(content)) !== null) {
    chapters.push(parseInt(match[1], 10));
  }
  return chapters;
}

export function validateMarkersInOrder(content: string): boolean {
  const chapters = validateChapterMarkers(content);
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i] <= chapters[i - 1]) return false;
  }
  return true;
}

// Levenshtein distance for fuzzy name matching
export function levenshtein(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= la.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[la.length][lb.length];
}

interface EntityRef {
  name: string;
  aliases: string[];
}

export function deduplicateEntities(
  entities: EntityRef[]
): Map<string, string[]> {
  const canonical = new Map<string, string[]>(); // canonical name → aliases
  const threshold = 3; // max Levenshtein distance for fuzzy match

  for (const entity of entities) {
    let matched = false;
    for (const [canonName, aliases] of canonical) {
      // Check exact match on name or aliases
      const allNames = [canonName, ...aliases].map((n) => n.toLowerCase());
      const entityNames = [entity.name, ...entity.aliases].map((n) =>
        n.toLowerCase()
      );

      const isMatch = entityNames.some(
        (en) =>
          allNames.includes(en) ||
          allNames.some((an) => levenshtein(en, an) <= threshold)
      );

      if (isMatch) {
        // Merge aliases — use the longer name as canonical
        if (entity.name.length > canonName.length) {
          const existing = canonical.get(canonName)!;
          canonical.delete(canonName);
          canonical.set(entity.name, [
            ...new Set([...existing, ...entity.aliases, canonName]),
          ]);
        } else {
          aliases.push(
            ...entity.aliases.filter((a) => !aliases.includes(a)),
            ...(entity.name !== canonName ? [entity.name] : [])
          );
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      canonical.set(entity.name, [...entity.aliases]);
    }
  }

  return canonical;
}

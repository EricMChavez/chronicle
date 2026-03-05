import {
  createStructureResponseSchema,
  detailResponseSchema,
  type StructureResponse,
  type DetailResponse,
} from "@/lib/utils/validation";

/**
 * Clean raw LLM output: strip code fences, extract JSON object.
 */
function cleanJsonResponse(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new SyntaxError("Empty response from AI model");
  }

  let cleaned = raw
    .replace(/^```(?:json)?\s*[\r\n]*/i, "")
    .replace(/[\r\n]*```\s*$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Parse JSON with fallback: fix trailing commas, then try truncation repair.
 */
function parseJsonWithRepair(cleaned: string): unknown {
  try {
    return JSON.parse(cleaned);
  } catch {
    const commaFixed = cleaned.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(commaFixed);
    } catch {
      const repaired = repairTruncatedJson(commaFixed);
      console.warn(
        "Response was truncated — recovered partial data from JSON"
      );
      return JSON.parse(repaired);
    }
  }
}

export function validateStructureResponse(raw: string, totalParagraphs?: number): StructureResponse {
  const cleaned = cleanJsonResponse(raw);
  const parsed = parseJsonWithRepair(cleaned);
  return createStructureResponseSchema(totalParagraphs).parse(parsed);
}

export function validateDetailResponse(raw: string): DetailResponse {
  const cleaned = cleanJsonResponse(raw);
  const parsed = parseJsonWithRepair(cleaned);
  return detailResponseSchema.parse(parsed);
}

/**
 * Repairs truncated JSON by finding the last complete object at depth 2
 * in the array and closing the structure.
 */
export function repairTruncatedJson(raw: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastEntityEnd = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;

    if (ch === "}" && depth === 2) {
      lastEntityEnd = i;
    }
  }

  if (lastEntityEnd > 0) {
    return raw.substring(0, lastEntityEnd + 1) + "]}";
  }

  throw new SyntaxError("Cannot repair truncated JSON — no complete objects found");
}

export function validateQuoteLength(text: string): boolean {
  return text.split(/\s+/).length <= 30;
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

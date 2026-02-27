import { getSectionGuidelines, type EntryType } from "./section-guidelines";

interface ChapterObservations {
  chapterNumber: number;
  observations: { fact: string }[];
  quotes: { text: string; speaker: string; context: string }[];
  connections: { name: string; detail: string }[];
}

export function buildSynthesisPrompt(
  entityName: string,
  entityType: EntryType,
  title: string,
  author: string | null,
  chapterObservations: ChapterObservations[]
): string {
  const authorStr = author ? ` by ${author}` : "";
  const sectionGuidelines = getSectionGuidelines(entityType);

  const observationsText = chapterObservations
    .map((ch) => {
      const obs = ch.observations.map((o) => `  - ${o.fact}`).join("\n");
      const quotes = ch.quotes
        .map((q) => `  - "${q.text}" — ${q.speaker} (${q.context})`)
        .join("\n");
      const conns = ch.connections
        .map((c) => `  - ${c.name}: ${c.detail}`)
        .join("\n");

      return `### Chapter ${ch.chapterNumber}
Observations:
${obs || "  (none)"}
Quotes:
${quotes || "  (none)"}
Connections:
${conns || "  (none)"}`;
    })
    .join("\n\n");

  return `You are writing a codex entry for "${entityName}" (${entityType}) from "${title}"${authorStr}. This is a reading companion — field notes for someone actively reading the book.

Below are chapter-by-chapter observations. Synthesize them into a clear, evidence-based entry using these guidelines:

STYLE:
- Present tense, matter-of-fact tone (like a field journal or dossier)
- Show, don't tell. Present what the text shows — facts, actions, dialogue, descriptions. Do not interpret or analyze.
- Use section headings that fit the material.
${sectionGuidelines}
- Only include sections that have material. Skip empty sections.
- Use bullet points for discrete facts. Use short paragraphs for connected narrative.
- Include the best 2-4 quotes that illuminate this entity.

STRUCTURE:
- Start with a bold name line: **{Name}** · {Type}
- Follow with an italic one-line identification
- Then an "At a Glance" section: 1-2 sentences identifying this entity
- Wrap each chapter's NEW information in <!-- chapter:N --> markers
- Each marker block adds to what came before — don't repeat earlier information
- The entry should read naturally at any chapter cutoff point

FORMAT RULES:
- Use markdown with ## for section headings
- Use > for block quotes
- Bullet points with - for lists
- Bold **keywords** for emphasis within lists
- The <!-- chapter:N --> marker goes on its own line before the content it introduces

CHAPTER OBSERVATIONS:
${observationsText}

Write the complete entry now. Output ONLY the markdown content, no code fences.`;
}

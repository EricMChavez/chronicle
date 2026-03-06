import type { ContentBlock } from "@/lib/utils/validation";

/**
 * Build the system prompt for chapter summarization (before structure discovery).
 */
export function buildSummaryPrompt(
  title: string,
  author: string | null,
  chapterNumber: number
): string {
  const authorStr = author ? ` by ${author}` : "";
  return `You are a meticulous reader summarizing chapter ${chapterNumber} of "${title}"${authorStr}.

Write a 2-3 sentence factual summary of what happens in this chapter. Focus on key events, character actions, and plot developments. Be concise and specific — no analysis or interpretation.

Respond with plain text only. No JSON, no markdown, no bullet points.`;
}

/**
 * Build the user message for chapter summarization.
 */
export function buildSummaryUserMessage(numberedText: string): string {
  return `Here is the chapter text with numbered paragraphs:\n\n${numberedText}`;
}

/**
 * Build the system prompt for Step 2: Structure Discovery.
 * One call per chapter — identifies subjects, paragraph refs, and significance scores.
 */
export function buildStructureDiscoveryPrompt(
  title: string,
  author: string | null,
  chapterNumber: number,
  existingManifest?: string
): string {
  const authorStr = author ? ` by ${author}` : "";
  const manifestSection = existingManifest
    ? `\n\n## Existing Subjects from Earlier Chapters\n\n${existingManifest}\n\nMark subjects that already appear above as "existing". New subjects get "new".`
    : "";

  return `You are a meticulous reader cataloguing every notable entity in chapter ${chapterNumber} of "${title}"${authorStr}.

Your job: read the numbered paragraphs and produce a structured JSON document listing EVERY entity worth tracking. Think breadth first: capturing 30 lean entries is better than 10 deep ones. Readers use these notes to look things up.

## What to Output

For each entity found in this chapter, record:
- **name**: The most complete canonical name
- **category**: A hierarchical path using \`>\` as separator, organizing the subject like a well-structured reference guide. Examples:
  - \`Characters > Hobbits\` for Frodo, Sam
  - \`Characters > Wizards\` for Gandalf
  - \`Items > Weapons > Swords\` for Sting, Glamdring
  - \`Locations > The Shire > Bag End\`
  - \`Factions > The Fellowship\`
  - \`Themes > Good vs Evil\`
  - \`Events > The Council of Elrond\`
  The depth and grouping names are at your discretion. Organize like a diligent student building a reference guide — logical groupings that make subjects easy to find.
- **status**: "new" if first seen, "existing" if it appeared in earlier chapters
- **paragraphs**: Compact range string using numeric paragraph numbers only (e.g., "3, 7, 12-15, 28"). Do NOT use words like "end" — use the actual last paragraph number
- **tags**: 0-2 short grouping tags that connect this subject to others ACROSS categories.
  Tags should NOT duplicate what the category conveys. Use sparingly for cross-cutting concerns
  like "prophesied", "ancient", "contested", "magical". Leave empty if no cross-category tag applies.
- **significance**: Integer 1-10 measuring how important this entity is in THIS chapter:
  - 8-10: Major characters who speak/act, central locations, pivotal events
  - 4-7: Supporting characters, mentioned locations, moderate themes
  - 1-3: Background mentions, passing references, minor details

**Categories can also be subjects.** When a category has enough material to warrant its own entry (e.g., "Hobbits" with general observations about hobbits as a race), create it as a subject nested under its parent category. Don't force category entries when there isn't meaningful material to fill them.

## Rules

1. **This chapter only.** Note what the text shows — facts, actions, dialogue, descriptions. Not analysis.
2. **Canonical names.** Use the character's most complete name.
3. **Be thorough.** It's better to include a low-significance entity than to miss it entirely.
4. **Consistent categories.** Reuse existing category paths from earlier chapters when applicable. Extend the tree as new groupings emerge.${manifestSection}`;
}

/**
 * Build the system prompt for Step 3: Detail Extraction.
 * Called per batch — extracts content blocks for specific subjects.
 */
export function buildDetailExtractionPrompt(
  title: string,
  author: string | null,
  chapterNumber: number,
  allSubjectNames: string[],
  hasPreviousBlocks?: boolean
): string {
  const authorStr = author ? ` by ${author}` : "";
  const subjectList = allSubjectNames.map((n) => `[${n}]`).join(", ");

  const incrementalNote = hasPreviousBlocks
    ? `\n\n## Incremental Rules

You will be given previous content blocks for some subjects from earlier chapters. For these subjects:
- Write only NEW information from THIS chapter. Do not repeat what the previous blocks already cover.
- Summary blocks should describe what happens to this subject in THIS chapter specifically.
- If nothing new is revealed, you may omit that block type entirely.`
    : "";

  return `You are taking detailed notes on specific entities from chapter ${chapterNumber} of "${title}"${authorStr} for a reading companion app.

You will be given one or more subjects to analyze, along with the relevant paragraphs where they appear.

## Content Blocks

For each subject, produce an array of typed content blocks. Each block has a \`type\` and \`text\`, plus optional fields depending on type:

| Type | Purpose | Extra Fields |
|------|---------|-------------|
| \`summary\` | Prose about this subject's role in THIS chapter. Length proportional to significance: 1-2 sentences for minor, 2-4 for major. | — |
| \`observation\` | A discrete noteworthy fact the summary doesn't cover. 0-2 per subject. | \`anchor\` (paragraph ref, e.g. "P3") |
| \`quote\` | An exact, vivid quote. 0-1 per subject. Max 30 words. | \`speaker\`, \`context\` |
| \`appearance\` | Physical or sensory description of this subject. Only when the text provides concrete details. | — |

**Every subject must have at least one \`summary\` block.** Other types are optional.

Also extract:
- **aliases**: Other names, nicknames, or titles for this entity

## Cross-Reference Syntax

When a block mentions another entity from this book, wrap its name in brackets: [Entity Name].
Known entities in this book: ${subjectList}

Only use bracket references for entities in the list above.

## Rules

1. **Show, don't tell.** Record observable facts, actions, dialogue, descriptions — not interpretations.
2. **Exact quotes only.** Maximum 30 words per quote.
3. **Be concise.** Focus on what's most notable and revealing about each subject.${incrementalNote}`;
}

/**
 * Build the user message for structure discovery (Step 2).
 */
export function buildStructureUserMessage(numberedText: string): string {
  return `Here is the chapter text with numbered paragraphs:\n\n${numberedText}`;
}

/**
 * Render previous blocks compactly for inclusion in the prompt.
 */
function renderPreviousBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "summary":
          return `  [summary] ${b.text}`;
        case "observation":
          return `  [observation] ${b.text}${b.anchor ? ` (${b.anchor})` : ""}`;
        case "quote":
          return `  [quote] "${b.text}" — ${b.speaker}${b.context ? ` (${b.context})` : ""}`;
        case "appearance":
          return `  [appearance] ${b.text}`;
      }
    })
    .join("\n");
}

/**
 * Build the user message for detail extraction (Step 3).
 * Includes the subjects to analyze and their relevant paragraph texts.
 * Optionally includes previous blocks for incremental extraction.
 */
export function buildDetailUserMessage(
  subjects: { name: string; category: string; paragraphs: number[] }[],
  paragraphTexts: Map<number, string>,
  previousBlocks?: Map<string, ContentBlock[]>
): string {
  const subjectLines = subjects
    .map((s) => `- ${s.name} (${s.category}): paragraphs ${s.paragraphs.join(", ")}`)
    .join("\n");

  // Collect all unique paragraph numbers needed
  const neededParagraphs = new Set<number>();
  for (const s of subjects) {
    for (const p of s.paragraphs) {
      neededParagraphs.add(p);
    }
  }

  // Build paragraph text section
  const sortedParagraphs = Array.from(neededParagraphs).sort((a, b) => a - b);
  const paragraphSection = sortedParagraphs
    .map((p) => {
      const text = paragraphTexts.get(p);
      return text ? `[P${p}] ${text}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  let result = `## Subjects to Analyze\n\n${subjectLines}\n\n## Relevant Paragraphs\n\n${paragraphSection}`;

  // Append previous content for incremental extraction
  if (previousBlocks && previousBlocks.size > 0) {
    const previousSection = subjects
      .map((s) => {
        const blocks = previousBlocks.get(s.name.toLowerCase());
        if (!blocks || blocks.length === 0) return null;
        return `### ${s.name}\n${renderPreviousBlocks(blocks)}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (previousSection) {
      result += `\n\n## Previous Content (do not repeat)\n\n${previousSection}`;
    }
  }

  return result;
}

/**
 * Build a category tree string from existing subjects for manifest display.
 */
function buildCategoryTree(
  existingSubjects: { name: string; category: string; chapters: number[]; significance: number }[]
): string {
  // Build a tree structure from category paths
  interface TreeNode {
    children: Map<string, TreeNode>;
  }
  const root: TreeNode = { children: new Map() };

  for (const s of existingSubjects) {
    const parts = s.category.split(">").map((p) => p.trim());
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part)!;
    }
  }

  // Render tree as indented text
  function renderNode(node: TreeNode, indent: number): string {
    const lines: string[] = [];
    for (const [name, child] of node.children) {
      lines.push(`${"  ".repeat(indent)}- ${name}`);
      lines.push(renderNode(child, indent + 1));
    }
    return lines.filter(Boolean).join("\n");
  }

  return renderNode(root, 0);
}

/**
 * Build a compact manifest of existing subjects for structure discovery context.
 * Includes both a subject list and a category tree for consistency.
 */
export function buildManifest(
  existingSubjects: {
    name: string;
    category: string;
    chapters: number[];
    significance: number;
  }[]
): string {
  if (existingSubjects.length === 0) return "";

  const subjectList = existingSubjects
    .map((s) => {
      const chRange =
        s.chapters.length === 1
          ? `ch${s.chapters[0]}`
          : `ch${s.chapters[0]}-${s.chapters[s.chapters.length - 1]}`;
      return `${s.name} (${s.category}, ${chRange}, sig:${s.significance})`;
    })
    .join(", ");

  const categoryTree = buildCategoryTree(existingSubjects);

  return `${subjectList}\n\nExisting category tree:\n${categoryTree}`;
}

import { db } from "@/lib/db";
import { books, chapters, chapterExtractions, entries, entryQuotes, entrySources, chapterSummaries } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { decrypt } from "@/lib/crypto/encryption";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { OpenAIProvider } from "@/lib/ai/openai";
import type { AIProvider, AIResponse, ProviderName } from "@/lib/ai/provider";
import {
  buildStructureDiscoveryPrompt,
  buildDetailExtractionPrompt,
  buildStructureUserMessage,
  buildDetailUserMessage,
  buildManifest,
  buildSummaryPrompt,
  buildSummaryUserMessage,
} from "@/lib/ai/prompts/extraction";
import { structureJsonSchema, detailJsonSchema } from "@/lib/ai/schemas";
import { validateStructureResponse, validateDetailResponse, deduplicateEntities } from "@/lib/ai/validation";
import type { ExtractionEntity, StructureSubject, ContentBlock } from "@/lib/utils/validation";
import { clearAbortController } from "./abort-registry";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { splitChapter, mergeExtractionResults, numberParagraphs } from "./chapter-splitter";

const DEBUG_DIR = path.join(process.cwd(), ".chronicle-debug");

// --- Concurrency & batching constants ---
const DETAIL_CONCURRENCY = 3;
const OUTPUT_TOKEN_BUDGET = 3200; // ~78% of 4096

async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function dumpResponse(step: string, chapter: number, attempt: number, response: AIResponse, bookTitle?: string) {
  try {
    const slug = bookTitle
      ? bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)
      : "unknown";
    const dir = path.join(DEBUG_DIR, slug);
    await mkdir(dir, { recursive: true });
    const filename = `ch${chapter}-${step}-attempt${attempt}.json`;
    let parsedContent: unknown = null;
    try {
      parsedContent = JSON.parse(response.content);
    } catch { /* leave null — raw string used instead */ }
    await writeFile(
      path.join(dir, filename),
      JSON.stringify(
        {
          finishReason: response.finishReason,
          usage: response.usage,
          contentLength: response.content.length,
          ...(parsedContent != null
            ? { content: parsedContent }
            : { content: response.content }),
        },
        null,
        2
      )
    );
    console.log(`[Chronicle] Dumped raw response to ${dir}/${filename}`);
  } catch (e) {
    console.warn(`[Chronicle] Failed to dump debug response: ${e}`);
  }
}

class ProcessingCancelledError extends Error {
  constructor() {
    super("Cancelled by user");
    this.name = "ProcessingCancelledError";
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ProcessingCancelledError();
  }
}

interface ApiKeyRecord {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

// --- Usage Tracking ---

interface UsageTracker {
  structureCalls: number;
  detailCalls: number;
  extractionPromptTokens: number;
  extractionCompletionTokens: number;
}

function createUsageTracker(): UsageTracker {
  return {
    structureCalls: 0,
    detailCalls: 0,
    extractionPromptTokens: 0,
    extractionCompletionTokens: 0,
  };
}

function trackUsage(tracker: UsageTracker, phase: "structure" | "detail", response: AIResponse): void {
  if (phase === "structure") tracker.structureCalls++;
  else tracker.detailCalls++;
  tracker.extractionPromptTokens += response.usage?.promptTokens ?? 0;
  tracker.extractionCompletionTokens += response.usage?.completionTokens ?? 0;
}

function logUsageSummary(tracker: UsageTracker): void {
  console.log(
    `[Chronicle] Processing complete — ` +
    `Extraction: ${tracker.structureCalls} structure + ${tracker.detailCalls} detail calls, ` +
    `${tracker.extractionPromptTokens} prompt / ${tracker.extractionCompletionTokens} completion tokens | ` +
    `Total: ${tracker.extractionPromptTokens + tracker.extractionCompletionTokens} tokens`
  );
}

// --- Model selection ---

function getExtractionModel(providerName: ProviderName): string {
  switch (providerName) {
    case "anthropic":
      return "claude-haiku-4-5-20251001";
    case "openai":
      return "gpt-4o-mini";
  }
}

export function createProvider(
  providerName: ProviderName,
  keyRecord: ApiKeyRecord,
  model?: string
): AIProvider {
  const apiKey = decrypt(keyRecord.encryptedKey, keyRecord.iv, keyRecord.authTag);
  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider(apiKey, model);
    case "openai":
      return new OpenAIProvider(apiKey, model);
  }
}

interface ChapterExtractionResult {
  chapterNumber: number;
  chapterSummary: string;
  entities: ExtractionEntity[];
}

// --- Multi-pass extraction ---

const MAX_EXTRACTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function isValidationError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
}

/**
 * Estimate output tokens for a subject based on significance.
 */
function estimateOutputTokens(significance: number): number {
  if (significance >= 8) return 500;
  if (significance >= 4) return 250;
  return 100;
}

/**
 * Batch subjects by paragraph locality for detail extraction.
 * Sorts by paragraph centroid so subjects referencing nearby text are grouped,
 * then greedily packs batches up to OUTPUT_TOKEN_BUDGET.
 * This minimizes duplicate paragraph input and maximizes output utilization.
 */
function batchByParagraphLocality(
  subjects: StructureSubject[]
): StructureSubject[][] {
  if (subjects.length === 0) return [];

  // Sort by paragraph centroid for text-region locality
  const withCentroid = subjects.map((s) => ({
    subject: s,
    centroid: s.paragraphs.length > 0
      ? s.paragraphs.reduce((a, b) => a + b, 0) / s.paragraphs.length
      : 0,
  }));
  withCentroid.sort((a, b) => a.centroid - b.centroid);

  const batches: StructureSubject[][] = [];
  let currentBatch: StructureSubject[] = [];
  let currentOutputCost = 0;

  for (const { subject } of withCentroid) {
    const cost = estimateOutputTokens(subject.significance);

    if (currentBatch.length > 0 && currentOutputCost + cost > OUTPUT_TOKEN_BUDGET) {
      batches.push(currentBatch);
      currentBatch = [subject];
      currentOutputCost = cost;
    } else {
      currentBatch.push(subject);
      currentOutputCost += cost;
    }
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  return batches;
}

/**
 * Step 1.5: Chapter Summarization — lightweight call for 2-3 sentence summary.
 */
async function summarizeChapter(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  numberedText: string,
  tracker?: UsageTracker
): Promise<string> {
  const systemPrompt = buildSummaryPrompt(title, author, chapterNumber);
  const userMessage = buildSummaryUserMessage(numberedText);

  const response = await provider.generateCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.2, maxTokens: 512, responseFormat: "text" }
  );

  if (tracker) trackUsage(tracker, "structure", response);
  console.log(
    `[Chronicle] Chapter ${chapterNumber} summary: ${response.usage?.completionTokens ?? 0} tokens`
  );
  return response.content.trim();
}

/**
 * Step 2: Structure Discovery — identify subjects, paragraph refs, significance.
 */
async function discoverStructure(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  numberedText: string,
  existingManifest?: string,
  tracker?: UsageTracker,
  totalParagraphs?: number
): Promise<{ subjects: StructureSubject[]; response: AIResponse }> {
  const systemPrompt = buildStructureDiscoveryPrompt(title, author, chapterNumber, existingManifest);
  const userMessage = buildStructureUserMessage(numberedText);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt++) {
    const response = await provider.generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      {
        temperature: 0.2,
        maxTokens: 8192,
        responseFormat: "json",
        jsonSchema: { name: "extract_structure", schema: structureJsonSchema },
      }
    );

    const maxTok = 8192;
    const used = response.usage?.completionTokens ?? 0;
    const pct = Math.round((used / maxTok) * 100);
    const truncated = response.finishReason === "max_tokens";
    if (truncated) {
      console.warn(
        `[Chronicle] Chapter ${chapterNumber} structure response was TRUNCATED — used ${used}/${maxTok} tokens (${pct}%)`
      );
    }
    await dumpResponse("structure", chapterNumber, attempt, response, title);

    try {
      const result = validateStructureResponse(response.content, totalParagraphs);
      if (tracker) trackUsage(tracker, "structure", response);
      console.log(
        `[Chronicle] Chapter ${chapterNumber} structure discovery produced ${result.subjects.length} subjects — ${used}/${maxTok} tokens (${pct}%)${truncated ? " [TRUNCATED, recovered partial]" : ""}`
      );
      return {
        subjects: result.subjects,
        response,
      };
    } catch (error) {
      if (!isValidationError(error)) throw error;
      lastError = error;
      // Count how many subjects were in the raw response before it broke
      const rawSubjectCount = (response.content.match(/"name"\s*:/g) || []).length;
      console.warn(
        `[Chronicle] Chapter ${chapterNumber} structure attempt ${attempt}/${MAX_EXTRACTION_ATTEMPTS} failed — ~${rawSubjectCount} subjects in raw response, ${used}/${maxTok} tokens (${pct}%): ${error instanceof Error ? error.message : error}`
      );
      if (attempt < MAX_EXTRACTION_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

/**
 * Step 3: Detail Extraction — extract facts, quotes, aliases for a batch of subjects.
 */
async function extractDetails(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  batch: StructureSubject[],
  paragraphTexts: Map<number, string>,
  allSubjectNames: string[],
  tracker?: UsageTracker,
  batchIndex?: number,
  previousBlocks?: Map<string, ContentBlock[]>
): Promise<ExtractionEntity[]> {
  const hasPrevious = previousBlocks && previousBlocks.size > 0;
  const systemPrompt = buildDetailExtractionPrompt(title, author, chapterNumber, allSubjectNames, hasPrevious);
  const userMessage = buildDetailUserMessage(
    batch.map((s) => ({ name: s.name, category: s.category, paragraphs: s.paragraphs })),
    paragraphTexts,
    previousBlocks
  );

  // Dynamic maxTokens based on batch estimated output cost
  const batchEstimate = batch.reduce((sum, s) => sum + estimateOutputTokens(s.significance), 0);
  const maxTok = Math.min(Math.max(Math.round(batchEstimate * 1.5), 2048), 8192);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt++) {
    const response = await provider.generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      {
        temperature: 0.2,
        maxTokens: maxTok,
        responseFormat: "json",
        jsonSchema: { name: "extract_details", schema: detailJsonSchema },
      }
    );

    const used = response.usage?.completionTokens ?? 0;
    const pct = Math.round((used / maxTok) * 100);
    const truncated = response.finishReason === "max_tokens";
    if (truncated) {
      console.warn(
        `[Chronicle] Chapter ${chapterNumber} detail response was TRUNCATED — used ${used}/${maxTok} tokens (${pct}%)`
      );
    }
    const detailStep = batchIndex != null ? `detail-batch${batchIndex}` : "detail";
    await dumpResponse(detailStep, chapterNumber, attempt, response, title);

    try {
      const result = validateDetailResponse(response.content);
      if (tracker) trackUsage(tracker, "detail", response);
      console.log(
        `[Chronicle] Chapter ${chapterNumber} detail extraction produced ${result.subjects.length}/${batch.length} subjects — ${used}/${maxTok} tokens (${pct}%)${truncated ? " [TRUNCATED, recovered partial]" : ""}`
      );

      // Merge detail results with structure data (significance, category)
      return result.subjects.map((detail) => {
        const structSubject = batch.find(
          (s) => s.name.toLowerCase() === detail.name.toLowerCase()
        );
        return {
          name: detail.name,
          aliases: detail.aliases,
          category: structSubject?.category ?? "Other",
          significance: structSubject?.significance ?? 5,
          tags: structSubject?.tags ?? [],
          blocks: detail.blocks,
        };
      });
    } catch (error) {
      if (!isValidationError(error)) throw error;
      lastError = error;
      const rawSubjectCount = (response.content.match(/"name"\s*:/g) || []).length;
      console.warn(
        `[Chronicle] Chapter ${chapterNumber} detail attempt ${attempt}/${MAX_EXTRACTION_ATTEMPTS} failed — ~${rawSubjectCount}/${batch.length} subjects in raw response, ${used}/${maxTok} tokens (${pct}%): ${error instanceof Error ? error.message : error}`
      );
      if (attempt < MAX_EXTRACTION_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

/**
 * Multi-pass extraction for a single chapter.
 */
export async function extractChapter(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  chapterText: string,
  tracker?: UsageTracker,
  existingManifest?: string,
  signal?: AbortSignal,
  previousResults?: ChapterExtractionResult[]
): Promise<ChapterExtractionResult> {
  const chunks = splitChapter(chapterText);

  if (chunks.length > 1) {
    console.log(
      `[Chronicle] Chapter ${chapterNumber} is large (${chapterText.length} chars), splitting into ${chunks.length} chunks`
    );

    const chunkResults: ChapterExtractionResult[] = [];
    for (const chunk of chunks) {
      checkAborted(signal);
      const result = await extractChapterSinglePass(
        provider, title, author, chapterNumber, chunk, tracker, existingManifest, previousResults
      );
      chunkResults.push(result);
    }

    const merged = mergeExtractionResults(chunkResults);
    return {
      chapterNumber,
      chapterSummary: merged.chapterSummary,
      entities: merged.entities,
    };
  }

  return extractChapterSinglePass(
    provider, title, author, chapterNumber, chapterText, tracker, existingManifest, previousResults
  );
}

/**
 * Multi-pass extraction for a single chunk of chapter text.
 * Step 1: Number paragraphs
 * Step 2: Structure discovery
 * Step 3: Batched detail extraction
 */
/**
 * Build a map of subject name (lowercase) -> ContentBlock[] from previous extraction results.
 * Includes the first chapter + last 3 chapters' blocks per subject to manage token budget.
 */
function buildPreviousBlocksMap(
  previousResults: ChapterExtractionResult[]
): Map<string, ContentBlock[]> {
  const allBySubject = new Map<string, { chapter: number; blocks: ContentBlock[] }[]>();

  for (const result of previousResults) {
    for (const entity of result.entities) {
      const key = entity.name.toLowerCase();
      if (!allBySubject.has(key)) allBySubject.set(key, []);
      allBySubject.get(key)!.push({
        chapter: result.chapterNumber,
        blocks: entity.blocks,
      });
    }
  }

  const result = new Map<string, ContentBlock[]>();
  for (const [key, chapterEntries] of allBySubject) {
    // Sort by chapter number
    chapterEntries.sort((a, b) => a.chapter - b.chapter);
    // Keep first chapter + last 3 chapters
    const selected: typeof chapterEntries = [];
    if (chapterEntries.length > 0) {
      selected.push(chapterEntries[0]);
      const tail = chapterEntries.slice(-3);
      for (const entry of tail) {
        if (!selected.includes(entry)) selected.push(entry);
      }
    }
    result.set(key, selected.flatMap((e) => e.blocks));
  }

  return result;
}

async function extractChapterSinglePass(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  chapterText: string,
  tracker?: UsageTracker,
  existingManifest?: string,
  previousResults?: ChapterExtractionResult[]
): Promise<ChapterExtractionResult> {
  // Step 1: Number paragraphs
  const { numbered, paragraphs } = numberParagraphs(chapterText);

  // Step 1.5: Chapter summary (lightweight, separate call)
  const chapterSummary = await summarizeChapter(
    provider, title, author, chapterNumber, numbered, tracker
  );

  // Step 2: Structure discovery
  const structure = await discoverStructure(
    provider, title, author, chapterNumber, numbered, existingManifest, tracker, paragraphs.size
  );

  if (structure.subjects.length === 0) {
    return {
      chapterNumber,
      chapterSummary,
      entities: [],
    };
  }

  // Build previous blocks map for incremental extraction
  const prevBlocks = previousResults && previousResults.length > 0
    ? buildPreviousBlocksMap(previousResults)
    : undefined;

  // Step 3: Batched detail extraction (parallel, locality-grouped)
  const batches = batchByParagraphLocality(structure.subjects);
  const allSubjectNames = structure.subjects.map((s) => s.name);

  const batchResults = await pMap(batches, async (batch, batchIdx) => {
    try {
      return await extractDetails(
        provider, title, author, chapterNumber,
        batch, paragraphs, allSubjectNames, tracker, batchIdx, prevBlocks
      );
    } catch (batchError) {
      console.warn(
        `[Chronicle] Chapter ${chapterNumber} detail batch failed for [${batch.map((s) => s.name).join(", ")}], skipping:`,
        batchError
      );
      // Fall back: create minimal entities from structure data
      return batch.map((s) => ({
        name: s.name,
        aliases: [],
        category: s.category,
        significance: s.significance,
        tags: s.tags ?? [],
        blocks: [],
      }));
    }
  }, DETAIL_CONCURRENCY);
  const allEntities = batchResults.flat();

  return {
    chapterNumber,
    chapterSummary,
    entities: allEntities,
  };
}

// --- Entity grouping & compilation ---

interface GroupedEntity {
  name: string;
  category: string;
  aliases: string[];
  significance: number;
  tags: string[];
  chapterData: {
    chapterNumber: number;
    blocks: ContentBlock[];
  }[];
}

function groupExtractionsByEntity(
  results: ChapterExtractionResult[]
): GroupedEntity[] {
  // Collect all entity references for deduplication
  const allRefs = results.flatMap((r) =>
    r.entities.map((e) => ({ name: e.name, aliases: e.aliases || [] }))
  );
  const canonicalMap = deduplicateEntities(allRefs);

  const entityMap = new Map<string, GroupedEntity>();

  // Initialize from canonical map
  for (const [canonName, aliases] of canonicalMap) {
    entityMap.set(canonName.toLowerCase(), {
      name: canonName,
      category: "Other",
      aliases,
      significance: 1,
      tags: [],
      chapterData: [],
    });
  }

  // Group chapter data under canonical names
  for (const result of results) {
    for (const entity of result.entities) {
      // Find canonical name
      let canonKey: string | undefined;
      for (const [key] of entityMap) {
        const group = entityMap.get(key)!;
        const allNames = [group.name, ...group.aliases].map((n) =>
          n.toLowerCase()
        );
        if (
          allNames.includes(entity.name.toLowerCase()) ||
          entity.aliases?.some((a) => allNames.includes(a.toLowerCase()))
        ) {
          canonKey = key;
          break;
        }
      }

      if (!canonKey) {
        canonKey = entity.name.toLowerCase();
        entityMap.set(canonKey, {
          name: entity.name,
          category: entity.category,
          aliases: entity.aliases || [],
          significance: entity.significance,
          tags: [...entity.tags],
          chapterData: [],
        });
      }

      const group = entityMap.get(canonKey)!;
      // Use the first non-"Other" category encountered
      if (group.category === "Other" && entity.category !== "Other") {
        group.category = entity.category;
      }
      // Cross-chapter significance: Math.max() of all chapter scores
      group.significance = Math.max(group.significance, entity.significance);
      // Merge tags (union, deduplicate)
      for (const tag of entity.tags) {
        if (!group.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
          group.tags.push(tag);
        }
      }

      group.chapterData.push({
        chapterNumber: result.chapterNumber,
        blocks: entity.blocks,
      });
    }
  }

  return Array.from(entityMap.values());
}

// --- Primary section headings per top-level category ---

const PRIMARY_HEADINGS: Record<string, string> = {
  characters: "What We Know",
  locations: "Description",
  events: "What Happened",
  factions: "Who They Are",
  items: "Description",
  themes: "Where It Appears",
  other: "What We Know",
};

function getPrimaryHeading(category: string): string {
  const topLevel = category.split(">")[0].trim().toLowerCase();
  return PRIMARY_HEADINGS[topLevel] || PRIMARY_HEADINGS.other;
}

/**
 * Compile a GroupedEntity into markdown content deterministically (no AI call).
 */
export function compileEntry(entity: GroupedEntity): string {
  const lines: string[] = [];

  // Header
  lines.push(`**${entity.name}** · ${entity.category}`);
  lines.push("");

  // Find the earliest summary block for the italic identification line and At a Glance
  const allSummaries = entity.chapterData
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .flatMap((ch) => ch.blocks.filter((b): b is ContentBlock & { type: "summary" } => b.type === "summary"));

  if (allSummaries.length > 0) {
    // Italic one-liner: first sentence of earliest summary
    const firstSentence = allSummaries[0].text.split(/(?<=[.!?])\s+/)[0];
    lines.push(`*${firstSentence}*`);
    lines.push("");

    // At a Glance
    lines.push("## At a Glance");
    lines.push(allSummaries[0].text);
    lines.push("");
  }

  // Chapter sections
  const primaryHeading = getPrimaryHeading(entity.category);
  let headingEmitted = false;

  for (const ch of entity.chapterData) {
    const summaries = ch.blocks.filter((b) => b.type === "summary");
    const appearances = ch.blocks.filter((b) => b.type === "appearance");
    const observations = ch.blocks.filter((b) => b.type === "observation");
    const quotes = ch.blocks.filter((b) => b.type === "quote");

    // Skip chapters with no content blocks
    if (summaries.length === 0 && appearances.length === 0 && observations.length === 0 && quotes.length === 0) {
      continue;
    }

    lines.push(`<!-- chapter:${ch.chapterNumber} -->`);

    // Emit the primary heading once (on the first chapter with content after At a Glance)
    if (!headingEmitted) {
      lines.push(`## ${primaryHeading}`);
      headingEmitted = true;
    }

    // Summary blocks as prose
    for (const s of summaries) {
      // Skip the first summary if it's the same as At a Glance (chapter 1)
      if (s === allSummaries[0]) continue;
      lines.push(s.text);
      lines.push("");
    }

    // Appearance blocks in italics
    for (const a of appearances) {
      lines.push(`*${a.text}*`);
      lines.push("");
    }

    // Observation blocks as bullets
    for (const o of observations) {
      lines.push(`- ${o.text}`);
    }
    if (observations.length > 0) lines.push("");

    // Quote blocks
    for (const q of quotes) {
      const speaker = "speaker" in q ? q.speaker : "narrator";
      const context = "context" in q && q.context ? ` (${q.context})` : "";
      lines.push(`> "${q.text}" — ${speaker}${context}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export async function processChapterBatch(
  bookId: string,
  provider: AIProvider,
  startChapter: number,
  batchSize: number = 2
): Promise<{ processed: number; total: number; done: boolean }> {
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) throw new Error("Book not found");

  const allChapters = await db.query.chapters.findMany({
    where: eq(chapters.bookId, bookId),
    orderBy: [asc(chapters.chapterNumber)],
  });

  const total = allChapters.length;
  const batch = allChapters.filter(
    (ch) =>
      ch.chapterNumber >= startChapter &&
      ch.chapterNumber < startChapter + batchSize
  );

  if (batch.length === 0) {
    return { processed: startChapter - 1, total, done: true };
  }

  for (const chapter of batch) {
    try {
      await extractChapter(
        provider,
        book.title,
        book.author,
        chapter.chapterNumber,
        chapter.content
      );

      await db
        .update(books)
        .set({
          processingProgress: chapter.chapterNumber,
          updatedAt: new Date(),
        })
        .where(eq(books.id, bookId));
    } catch (error) {
      console.error(`Error processing chapter ${chapter.chapterNumber}:`, error);
      throw error;
    }
  }

  const lastProcessed = batch[batch.length - 1].chapterNumber;
  return {
    processed: lastProcessed,
    total,
    done: lastProcessed >= total,
  };
}

/**
 * Batch insert helper — chunks an array and inserts each chunk.
 * Postgres has a parameter limit; chunk at 500 rows to stay safe.
 */
async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunkSize = 500
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(table).values(chunk as any));
  }
}

// --- Manifest tracking for cross-chapter context ---

interface ManifestEntry {
  name: string;
  category: string;
  chapters: number[];
  significance: number;
}

function updateManifest(
  manifest: Map<string, ManifestEntry>,
  chapterNumber: number,
  entities: ExtractionEntity[]
): void {
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    const existing = manifest.get(key);
    if (existing) {
      existing.chapters.push(chapterNumber);
      existing.significance = Math.max(existing.significance, entity.significance);
    } else {
      manifest.set(key, {
        name: entity.name,
        category: entity.category,
        chapters: [chapterNumber],
        significance: entity.significance,
      });
    }
  }
}

/**
 * Save a single chapter's extraction result to the DB (upsert).
 */
async function saveChapterExtraction(
  bookId: string,
  result: ChapterExtractionResult
): Promise<void> {
  // Upsert into chapterExtractions
  const existing = await db.query.chapterExtractions.findFirst({
    where: and(
      eq(chapterExtractions.bookId, bookId),
      eq(chapterExtractions.chapterNumber, result.chapterNumber)
    ),
  });
  if (existing) {
    await db
      .update(chapterExtractions)
      .set({ data: result, createdAt: new Date() })
      .where(eq(chapterExtractions.id, existing.id));
  } else {
    await db.insert(chapterExtractions).values({
      bookId,
      chapterNumber: result.chapterNumber,
      data: result,
    });
  }

  // Upsert chapter summary
  if (result.chapterSummary) {
    const existingSummary = await db.query.chapterSummaries.findFirst({
      where: and(
        eq(chapterSummaries.bookId, bookId),
        eq(chapterSummaries.chapterNumber, result.chapterNumber)
      ),
    });
    if (existingSummary) {
      await db
        .update(chapterSummaries)
        .set({ summary: result.chapterSummary })
        .where(eq(chapterSummaries.id, existingSummary.id));
    } else {
      await db.insert(chapterSummaries).values({
        bookId,
        chapterNumber: result.chapterNumber,
        summary: result.chapterSummary,
      });
    }
  }
}

/**
 * Load saved chapter extractions from the DB and rebuild manifest.
 */
async function loadSavedExtractions(
  bookId: string
): Promise<{
  results: ChapterExtractionResult[];
  manifest: Map<string, ManifestEntry>;
}> {
  const saved = await db.query.chapterExtractions.findMany({
    where: eq(chapterExtractions.bookId, bookId),
    orderBy: [asc(chapterExtractions.chapterNumber)],
  });

  const results: ChapterExtractionResult[] = [];
  const manifest = new Map<string, ManifestEntry>();

  for (const row of saved) {
    const data = row.data as ChapterExtractionResult;
    results.push(data);
    updateManifest(manifest, data.chapterNumber, data.entities);
  }

  return { results, manifest };
}

/**
 * Compilation phase: upsert entries from all extraction data.
 * Uses onConflictDoUpdate on (bookId, name) to update existing entries.
 * Pure template — no AI provider needed.
 */
async function runCompilationPhase(
  bookId: string,
  extractionResults: ChapterExtractionResult[],
  title: string,
  author: string | null,
  userId: string
): Promise<void> {
  // Group by entity
  const grouped = groupExtractionsByEntity(extractionResults);
  const currentNames = new Set(grouped.map((e) => e.name));

  for (const entity of grouped) {
    const content = compileEntry(entity);
    const firstChapter = Math.min(...entity.chapterData.map((c) => c.chapterNumber));

    const [upsertedEntry] = await db
      .insert(entries)
      .values({
        bookId,
        name: entity.name,
        category: entity.category,
        aliases: entity.aliases,
        content,
        firstAppearanceChapter: firstChapter,
        significance: entity.significance,
        tags: entity.tags,
        isPublic: false,
        generatedBy: userId,
      })
      .onConflictDoUpdate({
        target: [entries.bookId, entries.name],
        set: {
          content,
          aliases: entity.aliases,
          category: entity.category,
          significance: entity.significance,
          tags: entity.tags,
          firstAppearanceChapter: firstChapter,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Delete existing sources and quotes for this entry, then re-insert
    await db.delete(entrySources).where(eq(entrySources.entryId, upsertedEntry.id));
    await db.delete(entryQuotes).where(eq(entryQuotes.entryId, upsertedEntry.id));

    // Batch insert sources from observation blocks
    const sourceRows: {
      entryId: string;
      chapter: number;
      observation: string;
      anchor: string;
      sortOrder: number;
    }[] = [];
    for (const ch of entity.chapterData) {
      let sortIdx = 0;
      for (const block of ch.blocks) {
        if (block.type === "observation") {
          sourceRows.push({
            entryId: upsertedEntry.id,
            chapter: ch.chapterNumber,
            observation: block.text,
            anchor: block.anchor,
            sortOrder: sortIdx++,
          });
        }
      }
    }
    await batchInsert(entrySources, sourceRows);

    // Batch insert quotes from quote blocks
    const quoteRows: {
      entryId: string;
      text: string;
      speaker: string;
      context: string;
      chapter: number;
    }[] = [];
    for (const ch of entity.chapterData) {
      for (const block of ch.blocks) {
        if (block.type === "quote") {
          quoteRows.push({
            entryId: upsertedEntry.id,
            text: block.text,
            speaker: block.speaker,
            context: block.context,
            chapter: ch.chapterNumber,
          });
        }
      }
    }
    await batchInsert(entryQuotes, quoteRows);
  }

  // Clean up orphaned entries (names no longer in grouped set)
  const existingEntries = await db.query.entries.findMany({
    where: eq(entries.bookId, bookId),
    columns: { id: true, name: true },
  });
  for (const entry of existingEntries) {
    if (!currentNames.has(entry.name)) {
      await db.delete(entries).where(eq(entries.id, entry.id));
    }
  }
}

export async function runFullProcessing(
  bookId: string,
  providerName: ProviderName,
  keyRecord: ApiKeyRecord,
  userId: string,
  signal?: AbortSignal
): Promise<void> {
  const extractionModel = getExtractionModel(providerName);
  const extractionProvider = createProvider(providerName, keyRecord, extractionModel);

  const tracker = createUsageTracker();

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) throw new Error("Book not found");

  await db
    .update(books)
    .set({ processingStatus: "processing", processingError: null, updatedAt: new Date() })
    .where(eq(books.id, bookId));

  try {
    const allChapters = await db.query.chapters.findMany({
      where: eq(chapters.bookId, bookId),
      orderBy: [asc(chapters.chapterNumber)],
    });

    // Resume: load previously saved extractions
    const saved = await loadSavedExtractions(bookId);
    const extractionResults: ChapterExtractionResult[] = [...saved.results];
    const extractedChapterNumbers = new Set(saved.results.map((r) => r.chapterNumber));
    const manifest = saved.manifest;
    const failedChapters: number[] = [];

    if (extractedChapterNumbers.size > 0) {
      console.log(
        `[Chronicle] Resuming: ${extractedChapterNumbers.size}/${allChapters.length} chapters already extracted`
      );
    }

    for (const chapter of allChapters) {
      // Skip chapters that already have extractions
      if (extractedChapterNumbers.has(chapter.chapterNumber)) {
        continue;
      }

      checkAborted(signal);

      // Build manifest string from previously processed chapters
      const manifestEntries = Array.from(manifest.values());
      const manifestStr = manifestEntries.length > 0
        ? buildManifest(manifestEntries)
        : undefined;

      try {
        const result = await extractChapter(
          extractionProvider,
          book.title,
          book.author,
          chapter.chapterNumber,
          chapter.content,
          tracker,
          manifestStr,
          signal,
          extractionResults
        );
        extractionResults.push(result);

        // Save extraction immediately (survives crashes)
        await saveChapterExtraction(bookId, result);

        // Update manifest with this chapter's entities
        updateManifest(manifest, chapter.chapterNumber, result.entities);

        // Incremental compilation: compile entries from all extractions so far
        await runCompilationPhase(bookId, extractionResults, book.title, book.author, userId);
        await db
          .update(books)
          .set({ compiledChapters: chapter.chapterNumber })
          .where(eq(books.id, bookId));
      } catch (chapterError) {
        // Re-throw cancellation so the outer catch handles it
        if (chapterError instanceof ProcessingCancelledError) throw chapterError;

        console.error(
          `[Chronicle] Chapter ${chapter.chapterNumber} failed after ${MAX_EXTRACTION_ATTEMPTS} attempts, skipping:`,
          chapterError
        );
        failedChapters.push(chapter.chapterNumber);
      }

      await db
        .update(books)
        .set({
          processingProgress: chapter.chapterNumber,
          updatedAt: new Date(),
        })
        .where(eq(books.id, bookId));
    }

    if (extractionResults.length === 0) {
      throw new Error(
        `All ${allChapters.length} chapters failed extraction`
      );
    }

    checkAborted(signal);

    // Compile entries from all extraction results (no AI call needed)
    await runCompilationPhase(
      bookId, extractionResults,
      book.title, book.author, userId
    );

    await db
      .update(books)
      .set({
        processingStatus: "completed",
        processingProgress: allChapters.length,
        compiledChapters: allChapters.length,
        processingError:
          failedChapters.length > 0
            ? `Chapters ${failedChapters.join(", ")} failed extraction and were skipped`
            : null,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));

    // Clean up saved extractions after successful completion
    await db.delete(chapterExtractions).where(eq(chapterExtractions.bookId, bookId));

    logUsageSummary(tracker);
  } catch (error) {
    const isCancelled = error instanceof ProcessingCancelledError;
    const message = error instanceof Error ? error.message : "Unknown error";

    // Check how many extractions we have saved
    const savedCount = await db.query.chapterExtractions.findMany({
      where: eq(chapterExtractions.bookId, bookId),
      columns: { id: true },
    });

    if (savedCount.length > 0) {
      // Entries are already compiled incrementally — just set status to partial
      const totalChapters = await db.query.chapters.findMany({
        where: eq(chapters.bookId, bookId),
        columns: { id: true },
      });

      await db
        .update(books)
        .set({
          processingStatus: "partial",
          processingError: isCancelled
            ? `Cancelled by user — ${savedCount.length} of ${totalChapters.length} chapters processed`
            : `${message} — ${savedCount.length} of ${totalChapters.length} chapters processed`,
          updatedAt: new Date(),
        })
        .where(eq(books.id, bookId));
    } else {
      // No extractions at all — mark as failed
      await db
        .update(books)
        .set({
          processingStatus: "failed",
          processingError: isCancelled ? "Cancelled by user" : message,
          updatedAt: new Date(),
        })
        .where(eq(books.id, bookId));
    }

    logUsageSummary(tracker);
    if (!isCancelled) throw error;
  } finally {
    clearAbortController(bookId);
  }
}

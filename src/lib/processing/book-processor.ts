import { db } from "@/lib/db";
import { books, chapters, entries, entryQuotes, entrySources, chapterSummaries } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
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
import { buildSynthesisPrompt } from "@/lib/ai/prompts/synthesis";
import { validateStructureResponse, validateDetailResponse, deduplicateEntities } from "@/lib/ai/validation";
import type { ExtractionEntity, StructureSubject } from "@/lib/utils/validation";
import { clearAbortController } from "./abort-registry";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { splitChapter, mergeExtractionResults, numberParagraphs } from "./chapter-splitter";

const DEBUG_DIR = path.join(process.cwd(), ".chronicle-debug");

// --- Concurrency & batching constants ---
const DETAIL_CONCURRENCY = 3;
const SYNTHESIS_CONCURRENCY = 5;
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
  synthesisCalls: number;
  extractionPromptTokens: number;
  extractionCompletionTokens: number;
  synthesisPromptTokens: number;
  synthesisCompletionTokens: number;
}

function createUsageTracker(): UsageTracker {
  return {
    structureCalls: 0,
    detailCalls: 0,
    synthesisCalls: 0,
    extractionPromptTokens: 0,
    extractionCompletionTokens: 0,
    synthesisPromptTokens: 0,
    synthesisCompletionTokens: 0,
  };
}

function trackUsage(tracker: UsageTracker, phase: "structure" | "detail" | "synthesis", response: AIResponse): void {
  if (phase === "synthesis") {
    tracker.synthesisCalls++;
    tracker.synthesisPromptTokens += response.usage?.promptTokens ?? 0;
    tracker.synthesisCompletionTokens += response.usage?.completionTokens ?? 0;
  } else {
    if (phase === "structure") tracker.structureCalls++;
    else tracker.detailCalls++;
    tracker.extractionPromptTokens += response.usage?.promptTokens ?? 0;
    tracker.extractionCompletionTokens += response.usage?.completionTokens ?? 0;
  }
}

function logUsageSummary(tracker: UsageTracker): void {
  const totalPrompt = tracker.extractionPromptTokens + tracker.synthesisPromptTokens;
  const totalCompletion = tracker.extractionCompletionTokens + tracker.synthesisCompletionTokens;
  console.log(
    `[Chronicle] Processing complete — ` +
    `Extraction: ${tracker.structureCalls} structure + ${tracker.detailCalls} detail calls, ` +
    `${tracker.extractionPromptTokens} prompt / ${tracker.extractionCompletionTokens} completion tokens | ` +
    `Synthesis: ${tracker.synthesisCalls} calls, ${tracker.synthesisPromptTokens} prompt / ${tracker.synthesisCompletionTokens} completion tokens | ` +
    `Total: ${totalPrompt + totalCompletion} tokens (${totalPrompt} prompt + ${totalCompletion} completion)`
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
  batchIndex?: number
): Promise<ExtractionEntity[]> {
  const systemPrompt = buildDetailExtractionPrompt(title, author, chapterNumber, allSubjectNames);
  const userMessage = buildDetailUserMessage(
    batch.map((s) => ({ name: s.name, category: s.category, paragraphs: s.paragraphs })),
    paragraphTexts
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
          summary: detail.summary ?? "",
          observations: detail.observations,
          quotes: detail.quotes,
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
  signal?: AbortSignal
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
        provider, title, author, chapterNumber, chunk, tracker, existingManifest
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
    provider, title, author, chapterNumber, chapterText, tracker, existingManifest
  );
}

/**
 * Multi-pass extraction for a single chunk of chapter text.
 * Step 1: Number paragraphs
 * Step 2: Structure discovery
 * Step 3: Batched detail extraction
 */
async function extractChapterSinglePass(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  chapterText: string,
  tracker?: UsageTracker,
  existingManifest?: string
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

  // Step 3: Batched detail extraction (parallel, locality-grouped)
  const batches = batchByParagraphLocality(structure.subjects);
  const allSubjectNames = structure.subjects.map((s) => s.name);

  const batchResults = await pMap(batches, async (batch, batchIdx) => {
    try {
      return await extractDetails(
        provider, title, author, chapterNumber,
        batch, paragraphs, allSubjectNames, tracker, batchIdx
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
        summary: "",
        observations: [],
        quotes: [],
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

// --- Entity grouping & synthesis ---

interface GroupedEntity {
  name: string;
  category: string;
  aliases: string[];
  significance: number;
  tags: string[];
  chapterData: {
    chapterNumber: number;
    summary: string;
    observations: { fact: string; anchor: string }[];
    quotes: { text: string; speaker: string; context: string }[];
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
        summary: entity.summary ?? "",
        observations: entity.observations.map((o) => ({
          fact: o.fact,
          anchor: o.anchor,
        })),
        quotes: entity.quotes || [],
      });
    }
  }

  return Array.from(entityMap.values());
}

export async function synthesizeEntry(
  provider: AIProvider,
  entity: GroupedEntity,
  title: string,
  author: string | null,
  tracker?: UsageTracker
): Promise<string> {
  const prompt = buildSynthesisPrompt(
    entity.name,
    entity.category,
    title,
    author,
    entity.chapterData.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      summary: ch.summary,
      observations: ch.observations,
      quotes: ch.quotes,
    }))
  );

  // Dynamic maxTokens: 4096 default, 6144 for entities spanning 15+ chapters
  const chapterCount = entity.chapterData.length;
  const maxTokens = chapterCount >= 15 ? 6144 : 4096;

  const response = await provider.generateCompletion(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Write the entry now." },
    ],
    { temperature: 0.3, maxTokens }
  );

  if (tracker) trackUsage(tracker, "synthesis", response);
  return response.content;
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

export async function runFullProcessing(
  bookId: string,
  providerName: ProviderName,
  keyRecord: ApiKeyRecord,
  userId: string,
  signal?: AbortSignal
): Promise<void> {
  // Create two providers: cheaper for extraction, better for synthesis
  const extractionModel = getExtractionModel(providerName);
  const extractionProvider = createProvider(providerName, keyRecord, extractionModel);
  const synthesisProvider = createProvider(providerName, keyRecord);

  const tracker = createUsageTracker();

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) throw new Error("Book not found");

  await db
    .update(books)
    .set({ processingStatus: "processing", updatedAt: new Date() })
    .where(eq(books.id, bookId));

  try {
    const allChapters = await db.query.chapters.findMany({
      where: eq(chapters.bookId, bookId),
      orderBy: [asc(chapters.chapterNumber)],
    });

    const extractionResults: ChapterExtractionResult[] = [];
    const failedChapters: number[] = [];
    const manifest = new Map<string, ManifestEntry>();

    for (const chapter of allChapters) {
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
          signal
        );
        extractionResults.push(result);

        // Update manifest with this chapter's entities
        updateManifest(manifest, chapter.chapterNumber, result.entities);
      } catch (chapterError) {
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

    if (failedChapters.length === allChapters.length) {
      throw new Error(
        `All ${allChapters.length} chapters failed extraction`
      );
    }

    checkAborted(signal);

    // Insert chapter summaries (no cueQuestions)
    const summaryRows: {
      bookId: string;
      chapterNumber: number;
      summary: string;
    }[] = [];
    for (const result of extractionResults) {
      if (result.chapterSummary) {
        summaryRows.push({
          bookId,
          chapterNumber: result.chapterNumber,
          summary: result.chapterSummary,
        });
      }
    }
    await batchInsert(chapterSummaries, summaryRows);

    // Group by entity
    const grouped = groupExtractionsByEntity(extractionResults);

    // Synthesize entries (parallel)
    await pMap(grouped, async (entity) => {
      checkAborted(signal);

      const content = await synthesizeEntry(
        synthesisProvider, entity, book.title, book.author, tracker
      );
      const firstChapter = Math.min(...entity.chapterData.map((c) => c.chapterNumber));

      const [newEntry] = await db
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
        .returning();

      // Batch insert sources
      const sourceRows: {
        entryId: string;
        chapter: number;
        observation: string;
        anchor: string;
        sortOrder: number;
      }[] = [];
      for (const ch of entity.chapterData) {
        for (let i = 0; i < ch.observations.length; i++) {
          const obs = ch.observations[i];
          sourceRows.push({
            entryId: newEntry.id,
            chapter: ch.chapterNumber,
            observation: obs.fact,
            anchor: obs.anchor,
            sortOrder: i,
          });
        }
      }
      await batchInsert(entrySources, sourceRows);

      // Batch insert quotes
      const quoteRows: {
        entryId: string;
        text: string;
        speaker: string;
        context: string;
        chapter: number;
      }[] = [];
      for (const ch of entity.chapterData) {
        for (const quote of ch.quotes) {
          quoteRows.push({
            entryId: newEntry.id,
            text: quote.text,
            speaker: quote.speaker,
            context: quote.context,
            chapter: ch.chapterNumber,
          });
        }
      }
      await batchInsert(entryQuotes, quoteRows);
    }, SYNTHESIS_CONCURRENCY);

    await db
      .update(books)
      .set({
        processingStatus: "completed",
        processingProgress: allChapters.length,
        processingError:
          failedChapters.length > 0
            ? `Chapters ${failedChapters.join(", ")} failed extraction and were skipped`
            : null,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));

    logUsageSummary(tracker);
  } catch (error) {
    const isCancelled = error instanceof ProcessingCancelledError;
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(books)
      .set({
        processingStatus: "failed",
        processingError: isCancelled ? "Cancelled by user" : message,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));
    logUsageSummary(tracker);
    if (!isCancelled) throw error;
  } finally {
    clearAbortController(bookId);
  }
}

import { db } from "@/lib/db";
import { books, chapters, entries, entryQuotes, entrySources, entryConnections } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { decrypt } from "@/lib/crypto/encryption";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { OpenAIProvider } from "@/lib/ai/openai";
import type { AIProvider, ProviderName } from "@/lib/ai/provider";
import { buildExtractionPrompt, buildExtractionUserMessage } from "@/lib/ai/prompts/extraction";
import { buildSynthesisPrompt } from "@/lib/ai/prompts/synthesis";
import { validateExtractionResponse, deduplicateEntities } from "@/lib/ai/validation";
import type { ExtractionEntity } from "@/lib/utils/validation";
import type { EntryType } from "@/lib/ai/prompts/section-guidelines";

interface ApiKeyRecord {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

export function createProvider(
  providerName: ProviderName,
  keyRecord: ApiKeyRecord
): AIProvider {
  const apiKey = decrypt(keyRecord.encryptedKey, keyRecord.iv, keyRecord.authTag);
  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
  }
}

interface ChapterExtractionResult {
  chapterNumber: number;
  entities: ExtractionEntity[];
}

export async function extractChapter(
  provider: AIProvider,
  title: string,
  author: string | null,
  chapterNumber: number,
  chapterText: string
): Promise<ChapterExtractionResult> {
  const systemPrompt = buildExtractionPrompt(title, author, chapterNumber);
  const userMessage = buildExtractionUserMessage(chapterText);

  const response = await provider.generateCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.2, responseFormat: "json" }
  );

  const data = validateExtractionResponse(response.content);
  return { chapterNumber, entities: data.entities };
}

interface GroupedEntity {
  name: string;
  type: EntryType;
  aliases: string[];
  chapterData: {
    chapterNumber: number;
    observations: { fact: string; excerpt: string; searchHint: string }[];
    quotes: { text: string; speaker: string; context: string }[];
    connections: { name: string; detail: string }[];
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
      type: "other",
      aliases,
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
          type: entity.type as EntryType,
          aliases: entity.aliases || [],
          chapterData: [],
        });
      }

      const group = entityMap.get(canonKey)!;
      // Use the first non-other type encountered
      if (group.type === "other" && entity.type !== "other") {
        group.type = entity.type as EntryType;
      }

      group.chapterData.push({
        chapterNumber: result.chapterNumber,
        observations: entity.observations.map((o) => ({
          fact: o.fact,
          excerpt: o.excerpt,
          searchHint: o.searchHint,
        })),
        quotes: entity.quotes || [],
        connections: entity.connections || [],
      });
    }
  }

  return Array.from(entityMap.values());
}

export async function synthesizeEntry(
  provider: AIProvider,
  entity: GroupedEntity,
  title: string,
  author: string | null
): Promise<string> {
  const prompt = buildSynthesisPrompt(
    entity.name,
    entity.type,
    title,
    author,
    entity.chapterData.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      observations: ch.observations,
      quotes: ch.quotes,
      connections: ch.connections,
    }))
  );

  const response = await provider.generateCompletion(
    [
      { role: "system", content: prompt },
      { role: "user", content: "Write the entry now." },
    ],
    { temperature: 0.3 }
  );

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

export async function runFullProcessing(
  bookId: string,
  providerName: ProviderName,
  keyRecord: ApiKeyRecord,
  userId: string
): Promise<void> {
  const provider = createProvider(providerName, keyRecord);

  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
  });
  if (!book) throw new Error("Book not found");

  await db
    .update(books)
    .set({ processingStatus: "processing", updatedAt: new Date() })
    .where(eq(books.id, bookId));

  try {
    // Pass 1: Extract from all chapters
    const allChapters = await db.query.chapters.findMany({
      where: eq(chapters.bookId, bookId),
      orderBy: [asc(chapters.chapterNumber)],
    });

    const extractionResults: ChapterExtractionResult[] = [];
    for (const chapter of allChapters) {
      const result = await extractChapter(
        provider,
        book.title,
        book.author,
        chapter.chapterNumber,
        chapter.content
      );
      extractionResults.push(result);

      await db
        .update(books)
        .set({
          processingProgress: chapter.chapterNumber,
          updatedAt: new Date(),
        })
        .where(eq(books.id, bookId));
    }

    // Group by entity
    const grouped = groupExtractionsByEntity(extractionResults);

    // Pass 2: Synthesize entries
    const entryMap = new Map<string, string>(); // entity name → entry ID
    for (const entity of grouped) {
      const content = await synthesizeEntry(provider, entity, book.title, book.author);
      const firstChapter = Math.min(...entity.chapterData.map((c) => c.chapterNumber));

      const [newEntry] = await db
        .insert(entries)
        .values({
          bookId,
          name: entity.name,
          type: entity.type,
          aliases: entity.aliases,
          content,
          firstAppearanceChapter: firstChapter,
          isPublic: false,
          generatedBy: userId,
        })
        .returning();

      entryMap.set(entity.name.toLowerCase(), newEntry.id);

      // Insert sources
      for (const ch of entity.chapterData) {
        for (let i = 0; i < ch.observations.length; i++) {
          const obs = ch.observations[i];
          await db.insert(entrySources).values({
            entryId: newEntry.id,
            chapter: ch.chapterNumber,
            observation: obs.fact,
            excerpt: obs.excerpt,
            searchHint: obs.searchHint,
            sortOrder: i,
          });
        }

        // Insert quotes
        for (const quote of ch.quotes) {
          await db.insert(entryQuotes).values({
            entryId: newEntry.id,
            text: quote.text,
            speaker: quote.speaker,
            context: quote.context,
            chapter: ch.chapterNumber,
          });
        }
      }
    }

    // Insert connections (second pass so all entry IDs exist)
    for (const entity of grouped) {
      const sourceId = entryMap.get(entity.name.toLowerCase());
      if (!sourceId) continue;

      for (const ch of entity.chapterData) {
        for (const conn of ch.connections) {
          const targetId = entryMap.get(conn.name.toLowerCase());
          if (!targetId) continue;

          await db.insert(entryConnections).values({
            sourceEntryId: sourceId,
            targetEntryId: targetId,
            description: conn.detail,
            chapter: ch.chapterNumber,
          });
        }
      }
    }

    await db
      .update(books)
      .set({
        processingStatus: "completed",
        processingProgress: allChapters.length,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(books)
      .set({
        processingStatus: "failed",
        processingError: message,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));
    throw error;
  }
}

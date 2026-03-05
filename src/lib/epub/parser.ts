import { initEpubFile, type EpubFile } from "@lingo-reader/epub-parser";

export interface ParsedChapter {
  title: string;
  content: string;
  wordCount: number;
}

export interface ParsedBook {
  title: string;
  author: string | null;
  description: string | null;
  language: string | null;
  publisher: string | null;
  publishedDate: string | null;
  isbn: string | null;
  chapters: ParsedChapter[];
}

const MIN_CHAPTER_LENGTH = 200;

export async function parseEpub(filePath: string): Promise<ParsedBook> {
  let epub: EpubFile | null = null;

  try {
    epub = await initEpubFile(filePath);

    const metadata = epub.getMetadata();
    const spine = epub.getSpine();
    const toc = epub.getToc();

    const title = metadata?.title || "Untitled";
    const creators = metadata?.creator;
    const author = creators && creators.length > 0
      ? creators.map((c) => c.contributor).join(", ")
      : null;
    const description = metadata?.description || null;
    const language = metadata?.language || null;
    const publisher = metadata?.publisher || null;
    const publishedDate = null; // Not directly available in metadata type
    const isbn = extractIsbn(metadata) || null;

    // Build a map of spine item IDs to TOC titles
    const tocTitleMap = new Map<string, string>();
    if (toc) {
      const flattenToc = (points: typeof toc): void => {
        for (const point of points) {
          if (point.href) {
            // Strip fragment from href to match spine items
            const baseHref = point.href.split("#")[0];
            if (point.label) {
              tocTitleMap.set(baseHref, point.label);
            }
          }
          if (point.children && point.children.length > 0) {
            flattenToc(point.children);
          }
        }
      };
      flattenToc(toc);
    }

    const chapters: ParsedChapter[] = [];
    let chapterIndex = 0;

    for (const spineItem of spine) {
      try {
        const chapter = await epub.loadChapter(spineItem.id);
        if (!chapter?.html) continue;

        const text = extractTextFromHtml(chapter.html);
        if (text.length < MIN_CHAPTER_LENGTH) continue;

        chapterIndex++;
        const wordCount = text.split(/\s+/).filter(Boolean).length;

        // Try to find a title from TOC, fallback to generic
        let chapterTitle = `Chapter ${chapterIndex}`;
        if (spineItem.href) {
          const baseHref = spineItem.href.split("#")[0];
          const tocTitle = tocTitleMap.get(baseHref);
          if (tocTitle) chapterTitle = tocTitle;
        }

        chapters.push({
          title: chapterTitle,
          content: text,
          wordCount,
        });
      } catch {
        // Skip chapters that fail to load
        continue;
      }
    }

    return {
      title,
      author,
      description,
      language,
      publisher,
      publishedDate,
      isbn,
      chapters,
    };
  } finally {
    epub?.destroy();
  }
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")              // normalize line endings first
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Insert double newlines for block-level elements to preserve paragraph boundaries
    .replace(/<\/?(?:p|div|br|h[1-6]|li|blockquote|section|article|header|footer|tr|hr)[^>]*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")          // strip remaining inline tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, " ")         // collapse horizontal whitespace (preserve newlines)
    .replace(/\n{3,}/g, "\n\n")        // collapse excessive newlines to double
    .replace(/^[^\S\n]+|[^\S\n]+$/gm, "")  // trim horizontal whitespace from each line
    .replace(/\n{3,}/g, "\n\n")        // final pass after trimming
    .trim();
}

function extractIsbn(metadata: ReturnType<EpubFile["getMetadata"]>): string | null {
  try {
    const identifier = metadata?.identifier;
    if (!identifier?.id) return null;

    const cleaned = identifier.id.replace(/[-\s]/g, "");
    if (/^(97[89])?\d{9}[\dX]$/i.test(cleaned)) {
      return cleaned;
    }
  } catch {
    // ISBN extraction is best-effort
  }
  return null;
}

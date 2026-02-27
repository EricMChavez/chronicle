/**
 * Filters markdown content by chapter progress.
 * Content wrapped in <!-- chapter:N --> markers is only included
 * if N <= currentChapter.
 */
export function filterContentByProgress(
  content: string,
  currentChapter: number
): string {
  const markerRegex = /<!-- chapter:(\d+) -->/g;
  const segments: { chapter: number; startIndex: number }[] = [];

  let match;
  while ((match = markerRegex.exec(content)) !== null) {
    segments.push({
      chapter: parseInt(match[1], 10),
      startIndex: match.index,
    });
  }

  if (segments.length === 0) return content;

  // Content before the first marker is always included
  let result = content.slice(0, segments[0].startIndex);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.chapter > currentChapter) continue;

    const start = segment.startIndex;
    const end = i + 1 < segments.length ? segments[i + 1].startIndex : content.length;
    const text = content.slice(start, end);

    // Strip the marker itself
    result += text.replace(/<!-- chapter:\d+ -->\n?/, "");
  }

  return result.trim();
}

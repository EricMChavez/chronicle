export function buildExtractionPrompt(
  title: string,
  author: string | null,
  chapterNumber: number
): string {
  const authorStr = author ? ` by ${author}` : "";
  return `You are building a reading companion — a codex of field notes for someone actively reading "${title}"${authorStr}.

Given the text of chapter ${chapterNumber}, identify all significant entities and record what the text SHOWS about them.

CRITICAL RULES:
1. ONLY record what appears in THIS chapter. Never reference events from other chapters, even if you know the book.
2. Show, don't tell. Record observable facts, actions, dialogue, and descriptions — not interpretations or analysis.
3. Quotes must be EXACT text from the chapter. Maximum 40 words each. Choose quotes that are vivid, revealing, or memorable.
4. Use the character's most complete name as the canonical identifier. Note aliases separately.
5. Only note connections between entities that are demonstrated in the text through interaction, dialogue, or explicit association.
6. For each observation, include a surrounding excerpt (2-4 sentences of exact text) and a unique search hint (10-20 word phrase from the excerpt that can be searched in an ePub reader).

Output valid JSON matching this schema:
{
  "entities": [{
    "name": "string — canonical name",
    "aliases": ["string — other names used in this chapter"],
    "type": "character|location|faction|item|event|theme",
    "observations": [{
      "fact": "string — a discrete observation or fact",
      "excerpt": "string — 2-4 sentences from the text surrounding this observation (exact text)",
      "searchHint": "string — a unique 10-20 word phrase from the excerpt that can be searched for in an ePub reader"
    }],
    "quotes": [{"text": "string — exact quote, max 40 words", "speaker": "string — who says it (or 'narrator')", "context": "string — brief setup for the quote"}],
    "connections": [{"name": "string — other entity name", "detail": "string — what the text shows about this relationship in this chapter"}]
  }]
}

Respond ONLY with valid JSON. No markdown code fences, no explanation.`;
}

export function buildExtractionUserMessage(chapterText: string): string {
  return `Here is the chapter text to analyze:\n\n${chapterText}`;
}

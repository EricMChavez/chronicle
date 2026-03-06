import type { ProviderName } from "./provider";

// Rough estimates: 1 token ≈ 4 characters (English text)
const CHARS_PER_TOKEN = 4;

// Per 1M tokens pricing (approximate)
const PRICING: Record<ProviderName, { input: number; output: number }> = {
  anthropic: { input: 3.0, output: 15.0 }, // Claude Sonnet 4.5
  openai: { input: 2.5, output: 10.0 }, // GPT-4o
};

interface CostEstimate {
  totalTokens: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export function estimateProcessingCost(
  chapters: { wordCount: number }[],
  provider: ProviderName
): CostEstimate {
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalChars = totalWords * 5; // average word length
  const contentTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

  // System prompt + formatting overhead per chapter
  const promptOverhead = chapters.length * 500;
  const estimatedInputTokens = contentTokens + promptOverhead;

  // Output is typically 30-50% of input for extraction
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.4);

  const pricing = PRICING[provider];
  const inputCost = (estimatedInputTokens / 1_000_000) * pricing.input;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.output;

  return {
    totalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: Math.round((inputCost + outputCost) * 100) / 100,
  };
}

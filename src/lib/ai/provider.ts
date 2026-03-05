export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  model?: string;
}

export interface AIResponse {
  content: string;
  finishReason: "stop" | "max_tokens" | "content_filter" | "unknown";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  generateCompletion(messages: AIMessage[], options?: AIOptions): Promise<AIResponse>;
}

export type ProviderName = "anthropic" | "openai";

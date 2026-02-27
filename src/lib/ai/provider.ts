export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
}

export interface AIResponse {
  content: string;
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

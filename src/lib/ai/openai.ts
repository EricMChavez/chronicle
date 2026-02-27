import OpenAI from "openai";
import type { AIProvider, AIMessage, AIOptions, AIResponse } from "./provider";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateCompletion(
    messages: AIMessage[],
    options: AIOptions = {}
  ): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(options.responseFormat === "json" && {
        response_format: { type: "json_object" },
      }),
    });

    const content = response.choices[0]?.message?.content || "";

    return {
      content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

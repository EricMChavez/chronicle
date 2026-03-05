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
      model: options.model ?? this.model,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(options.jsonSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: options.jsonSchema.name,
                strict: false,
                schema: options.jsonSchema.schema,
              },
            },
          }
        : options.responseFormat === "json"
          ? { response_format: { type: "json_object" as const } }
          : {}),
    });

    const content = response.choices[0]?.message?.content || "";

    const rawFinishReason = response.choices[0]?.finish_reason;
    const finishReason =
      rawFinishReason === "stop"
        ? "stop" as const
        : rawFinishReason === "length"
          ? "max_tokens" as const
          : rawFinishReason === "content_filter"
            ? "content_filter" as const
            : "unknown" as const;

    return {
      content,
      finishReason,
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

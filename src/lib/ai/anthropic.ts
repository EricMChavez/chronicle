import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIMessage, AIOptions, AIResponse } from "./provider";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-5-20250929") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateCompletion(
    messages: AIMessage[],
    options: AIOptions = {}
  ): Promise<AIResponse> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const toolParams = options.jsonSchema
      ? {
          tools: [
            {
              name: options.jsonSchema.name,
              description: "Extract structured data",
              input_schema: options.jsonSchema.schema as Anthropic.Tool["input_schema"],
            },
          ],
          tool_choice: {
            type: "tool" as const,
            name: options.jsonSchema.name,
          },
        }
      : {};

    const response = await this.client.messages.create({
      model: options.model ?? this.model,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      system: systemMessage?.content || "",
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      ...toolParams,
    });

    const block = response.content[0];
    const content =
      block.type === "tool_use"
        ? JSON.stringify(block.input)
        : block.type === "text"
          ? block.text
          : "";

    const finishReason =
      response.stop_reason === "end_turn"
        ? "stop" as const
        : response.stop_reason === "max_tokens"
          ? "max_tokens" as const
          : "unknown" as const;

    return {
      content,
      finishReason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}

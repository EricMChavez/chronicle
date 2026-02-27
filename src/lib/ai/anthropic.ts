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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      system: systemMessage?.content || "",
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}

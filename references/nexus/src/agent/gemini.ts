import { GoogleGenerativeAI, type GenerateContentStreamResult, type Content, type Part, type Tool, FunctionCallingMode } from "@google/generative-ai";
import type { AIProvider, StreamParams, StreamEvent, Message, MessageContent, ToolDefinition } from "./provider.js";

function toGeminiContents(messages: Message[]): Content[] {
  const contents: Content[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue; // handled via systemInstruction

    const role = msg.role === "assistant" ? "model" : "user";
    const parts: Part[] = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else {
      for (const block of msg.content as MessageContent[]) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "tool_use") {
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input,
            },
          });
        } else if (block.type === "tool_result") {
          parts.push({
            functionResponse: {
              name: block.toolUseId,
              response: { result: block.content },
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

function toGeminiTools(tools: ToolDefinition[]): Tool[] {
  if (tools.length === 0) return [];

  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any,
    })),
  }];
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async *stream(params: StreamParams): AsyncIterable<StreamEvent> {
    const model = this.client.getGenerativeModel({
      model: params.model,
      systemInstruction: params.systemPrompt ? { role: "user", parts: [{ text: params.systemPrompt }] } : undefined,
    });

    const contents = toGeminiContents(params.messages);
    const tools = params.tools ? toGeminiTools(params.tools) : [];

    const result: GenerateContentStreamResult = await model.generateContentStream({
      contents,
      tools: tools.length > 0 ? tools : undefined,
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let hasToolCalls = false;

    for await (const chunk of result.stream) {
      const candidate = chunk.candidates?.[0];
      if (!candidate) continue;

      for (const part of candidate.content?.parts ?? []) {
        if (part.text) {
          yield { type: "text_delta", text: part.text };
        }

        if (part.functionCall) {
          hasToolCalls = true;
          const id = `gemini_${part.functionCall.name}_${Date.now()}`;
          yield {
            type: "tool_use_start",
            id,
            name: part.functionCall.name,
          };
          yield {
            type: "tool_use_end",
            id,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          };
        }
      }

      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
      }
    }

    const stopReason = hasToolCalls ? "tool_use" : "end_turn";

    yield {
      type: "message_end",
      usage: { inputTokens, outputTokens },
      stopReason,
    };
  }
}

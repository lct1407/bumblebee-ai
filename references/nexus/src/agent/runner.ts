import type { AIProvider, Message, StreamEvent, TokenUsage, ToolDefinition } from "./provider.js";
import type { AgentTool, ToolContext } from "./tools.js";
import { buildContextMessages } from "./context.js";
import { buildSystemPrompt, type SystemPromptParams } from "./system-prompt.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("agent-runner");

const MAX_ITERATIONS = 20;

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
  durationMs: number;
}

export interface AgentRunResult {
  text: string;
  usage: TokenUsage;
  iterations: number;
  toolCalls: ToolCallRecord[];
  aborted: boolean;
  error?: string;
}

export interface AgentRunParams {
  provider: AIProvider;
  model: string;
  messages: Message[];
  tools: AgentTool[];
  systemPromptParams: SystemPromptParams;
  maxContextTokens: number;
  signal: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
  strapiJwt?: string;
}

function toolsToDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export async function runAgent(params: AgentRunParams): Promise<AgentRunResult> {
  const {
    provider,
    model,
    tools,
    systemPromptParams,
    maxContextTokens,
    signal,
    onEvent,
  } = params;

  const systemPrompt = await buildSystemPrompt(systemPromptParams);
  const toolDefs = toolsToDefinitions(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  let messages = [...params.messages];
  const allToolCalls: ToolCallRecord[] = [];
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = "";
  let iterations = 0;
  let aborted = false;

  const toolCtx: ToolContext & { strapiJwt?: string } = {
    workingDir: process.cwd(),
    signal,
    sessionKey: systemPromptParams.sessionKey ?? "",
    strapiJwt: params.strapiJwt,
  };

  try {
    for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
      if (signal.aborted) {
        aborted = true;
        break;
      }

      const contextMessages = buildContextMessages({
        systemPrompt,
        history: messages.slice(0, -1),
        newMessage: messages[messages.length - 1],
        maxTokens: maxContextTokens,
        reserveForResponse: 8192,
      });

      let iterText = "";
      let stopReason = "";
      const pendingToolCalls: Array<{
        id: string;
        name: string;
        inputJson: string;
      }> = [];

      const stream = provider.stream({
        model,
        messages: contextMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        systemPrompt,
        maxTokens: 8192,
        signal,
      });

      for await (const event of stream) {
        onEvent?.(event);

        switch (event.type) {
          case "text_delta":
            iterText += event.text;
            break;
          case "tool_use_start":
            pendingToolCalls.push({ id: event.id, name: event.name, inputJson: "" });
            break;
          case "tool_use_delta": {
            const tc = pendingToolCalls.find((t) => t.id === event.id);
            if (tc) tc.inputJson += event.partialInput;
            break;
          }
          case "tool_use_end": {
            const tc = pendingToolCalls.find((t) => t.id === event.id);
            if (tc) tc.inputJson = JSON.stringify(event.input);
            break;
          }
          case "message_end":
            totalUsage.inputTokens += event.usage.inputTokens;
            totalUsage.outputTokens += event.usage.outputTokens;
            stopReason = event.stopReason;
            break;
          case "error":
            throw new Error(event.error);
        }
      }

      // Build assistant message content
      const assistantContent: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      > = [];

      if (iterText) {
        assistantContent.push({ type: "text", text: iterText });
        finalText += iterText;
      }

      for (const tc of pendingToolCalls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.inputJson || "{}");
        } catch {
          input = {};
        }
        assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input });
      }

      messages.push({ role: "assistant", content: assistantContent });

      // If stop reason is end_turn or no tool calls, we're done
      if (stopReason === "end_turn" || stopReason === "stop" || pendingToolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      const toolResults: Array<{
        type: "tool_result";
        toolUseId: string;
        content: string;
        isError?: boolean;
      }> = [];

      for (const tc of pendingToolCalls) {
        const tool = toolMap.get(tc.name);
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.inputJson || "{}");
        } catch {
          input = {};
        }

        const start = Date.now();
        let result: string;
        let isError = false;

        if (!tool) {
          result = `Unknown tool: ${tc.name}`;
          isError = true;
        } else {
          try {
            result = await tool.execute(input, toolCtx);
          } catch (err: unknown) {
            result = err instanceof Error ? err.message : String(err);
            isError = true;
          }
        }

        const durationMs = Date.now() - start;
        allToolCalls.push({ id: tc.id, name: tc.name, input, result, isError, durationMs });
        toolResults.push({ type: "tool_result", toolUseId: tc.id, content: result, isError });

        onEvent?.({ type: "text_delta", text: "" } as StreamEvent); // signal progress

        log.info(`Tool ${tc.name} completed in ${durationMs}ms`, { isError });
      }

      messages.push({ role: "user", content: toolResults as any });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("abort")) {
      aborted = true;
    } else {
      return {
        text: finalText,
        usage: totalUsage,
        iterations: iterations + 1,
        toolCalls: allToolCalls,
        aborted: false,
        error: errorMsg,
      };
    }
  }

  return {
    text: finalText,
    usage: totalUsage,
    iterations: iterations + 1,
    toolCalls: allToolCalls,
    aborted,
  };
}

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  StreamParams,
  StreamEvent,
  Message,
  MessageContent,
  ToolDefinition,
} from './provider';

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;
type AnthropicContent = Anthropic.ContentBlockParam;

function mapMessages(messages: Message[]): AnthropicMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: m.content };
      }
      const blocks: AnthropicContent[] = m.content.map((c) => {
        if (c.type === 'text') {
          return { type: 'text' as const, text: c.text };
        }
        if (c.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: c.id,
            name: c.name,
            input: c.input,
          };
        }
        const tr = c as Extract<MessageContent, { type: 'tool_result' }>;
        return {
          type: 'tool_result' as const,
          tool_use_id: tr.toolUseId,
          content: tr.content,
          is_error: tr.isError,
        };
      });
      return { role: m.role as 'user' | 'assistant', content: blocks };
    });
}

function mapTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool['input_schema'],
  }));
}

export class AnthropicProvider implements AIProvider {
  id = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(params: StreamParams): AsyncIterable<StreamEvent> {
    const reqParams: Anthropic.MessageCreateParamsStreaming = {
      model: params.model,
      max_tokens: params.maxTokens ?? 8192,
      messages: mapMessages(params.messages),
      stream: true,
    };

    if (params.systemPrompt) {
      reqParams.system = [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }
    if (params.tools?.length) {
      reqParams.tools = mapTools(params.tools);
    }

    const stream = this.client.messages.stream(reqParams, {
      signal: params.signal,
    });

    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          toolBlocks.set(event.index, { id: block.id, name: block.name, json: '' });
          yield { type: 'tool_use_start', id: block.id, name: block.name };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield { type: 'text_delta', text: delta.text };
        } else if (delta.type === 'input_json_delta') {
          const tb = toolBlocks.get(event.index);
          if (tb) {
            tb.json += delta.partial_json;
            yield { type: 'tool_use_delta', id: tb.id, partialInput: delta.partial_json };
          }
        }
      } else if (event.type === 'content_block_stop') {
        const tb = toolBlocks.get(event.index);
        if (tb) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tb.json || '{}');
          } catch { /* empty */ }
          yield { type: 'tool_use_end', id: tb.id, name: tb.name, input };
          toolBlocks.delete(event.index);
        } else {
          yield { type: 'text_end' };
        }
      } else if (event.type === 'message_stop') {
        const finalMessage = await stream.finalMessage();
        yield {
          type: 'message_end',
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            cacheReadTokens: (finalMessage.usage as unknown as Record<string, number>).cache_read_input_tokens,
            cacheWriteTokens: (finalMessage.usage as unknown as Record<string, number>).cache_creation_input_tokens,
          },
          stopReason: finalMessage.stop_reason ?? 'end_turn',
        };
      }
    }
  }
}

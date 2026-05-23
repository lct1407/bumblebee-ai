import type { ChatMessageData, ToolCallData } from '../chat-message';

export function deserializeMessages(stored: any[]): ChatMessageData[] {
  return stored
    .filter((m: any) => {
      if (m.role === 'user') return !(Array.isArray(m.content) && m.content[0]?.type === 'tool_result');
      return m.role === 'assistant';
    })
    .map((m: any, i: number) => {
      let content = '';
      const toolCalls: ToolCallData[] = [];
      if (typeof m.content === 'string') {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'text') content += block.text;
          else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id || `tool-${i}-${toolCalls.length}`,
              name: block.name,
              input: block.input,
            });
          }
        }
      }
      return {
        id: `stored-${i}`,
        role: m.role as 'user' | 'assistant',
        content,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    })
    .filter((m: ChatMessageData) => m.content || (m.toolCalls && m.toolCalls.length > 0));
}

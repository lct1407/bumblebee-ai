'use client';

import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import type { ChatMessageData, ContentBlock, ToolCallData } from './chat-message-types';
import { ToolCallGroup } from './tool-call-group';
import { TodoProgress } from './chat-message-todos';
import type { AgentTodo } from './chat-message-types';

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.role === 'system') {
    return (
      <div className="font-mono text-xs text-[#666666] py-0.5">
        {message.content}
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="border-t border-[#333333] pt-3">
        <div className="flex items-start gap-2">
          <span className="font-mono text-sm text-[#cccccc] select-none shrink-0">❯</span>
          <div className="min-w-0 flex-1">
            <Markdown theme="dark">{message.content}</Markdown>
          </div>
        </div>
      </div>
    );
  }

  // Assistant — render blocks in order when available
  const blocks = message.contentBlocks;
  const hasBlocks = blocks && blocks.length > 0;

  // Group consecutive tool_use blocks together (like dev does)
  const groupedItems = useMemo(() => {
    if (!hasBlocks) return null;
    type GroupedItem =
      | { type: 'text'; text: string; key: number }
      | { type: 'tools'; tools: ToolCallData[]; key: number }
      | { type: 'todos'; todos: AgentTodo[]; key: number };
    const items: GroupedItem[] = [];
    let pendingTools: ToolCallData[] = [];
    let k = 0;
    function flushTools() {
      if (pendingTools.length > 0) {
        items.push({ type: 'tools', tools: pendingTools, key: k++ });
        pendingTools = [];
      }
    }
    for (const block of blocks!) {
      if (block.type === 'tool_use') {
        pendingTools.push(block.tool);
      } else if (block.type === 'todos') {
        flushTools();
        items.push({ type: 'todos', todos: block.todos, key: k++ });
      } else if (block.type === 'text' && block.text) {
        flushTools();
        items.push({ type: 'text', text: block.text, key: k++ });
      }
    }
    flushTools();
    return items;
  }, [hasBlocks, blocks]);

  return (
    <div className="group">
      {groupedItems ? (
        groupedItems.map((item) => {
          if (item.type === 'text') {
            return <Markdown key={item.key} theme="dark">{item.text}</Markdown>;
          }
          if (item.type === 'tools') {
            return <ToolCallGroup key={item.key} tools={item.tools} />;
          }
          if (item.type === 'todos') {
            return <TodoProgress key={item.key} todos={item.todos} />;
          }
          return null;
        })
      ) : (
        // Fallback for legacy messages without contentBlocks
        <>
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallGroup tools={message.toolCalls} />
          )}
          {message.content && (
            <Markdown theme="dark">{message.content}</Markdown>
          )}
        </>
      )}
      {message.isStreaming && !message.content && !message.toolCalls?.length && !hasBlocks && (
        <span className="animate-pulse font-mono text-sm text-[#666666]">Thinking...</span>
      )}
      {message.content && !message.isStreaming && (
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleCopy} className="p-1.5 text-[#555555] hover:text-[#888888]">
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}
    </div>
  );
}

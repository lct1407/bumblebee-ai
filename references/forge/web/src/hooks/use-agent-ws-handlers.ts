'use client';

import type { ChatMessageData, ToolCallData, ContentBlock } from '@/components/chat/chat-message';
import { getOrCreateAssistantMsg, finalizeAssistantMsg } from '@/lib/agent-stream-utils';

interface AgentHandlerOptions {
  projectSlug: string;
  sessionIdRef: React.MutableRefObject<string | null>;
  streamingMsgId: React.MutableRefObject<string | null>;
  streamingTextRef: React.MutableRefObject<string>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setClaudeSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setDesktopConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setUsage: React.Dispatch<React.SetStateAction<import('@/features/agent/api').AgentUsage>>;
  handlePromptBuilt: (requestId: string, prompt: string | null, error: string | null) => void;
  handlePreviewPrompt: (prompt: string, issueIds: string[] | undefined) => void;
}

export function createAgentMessageHandler(opts: AgentHandlerOptions) {
  const {
    projectSlug,
    sessionIdRef,
    streamingMsgId,
    streamingTextRef,
    setMessages,
    setIsRunning,
    setSessionId,
    setClaudeSessionId,
    setDesktopConnected,
    setUsage,
    handlePromptBuilt,
    handlePreviewPrompt,
  } = opts;

  function finalize() {
    finalizeAssistantMsg(streamingMsgId, streamingTextRef, setMessages);
  }

  function getOrCreate() {
    return getOrCreateAssistantMsg(streamingMsgId, streamingTextRef, setMessages, setIsRunning);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function handleMessage(msg: any) {
    if (msg.event === 'desktop:connected') { setDesktopConnected(true); return; }
    if (msg.event === 'desktop:disconnected') { setDesktopConnected(false); return; }

    if (msg.event === 'agent:prompt-built') {
      const { requestId, prompt, error } = msg.data || {};
      handlePromptBuilt(requestId, prompt, error);
      return;
    }

    if (msg.event === 'agent:preview-prompt') {
      const { prompt, issueIds, projectSlug: promptProjectSlug } = msg.data || {};
      if (prompt && promptProjectSlug === projectSlug) {
        setMessages([]);
        setSessionId(null);
        sessionIdRef.current = null;
        setIsRunning(false);
        setClaudeSessionId(null);
        handlePreviewPrompt(prompt, issueIds);
      }
      return;
    }

    const currentSessionId = sessionIdRef.current;
    if (msg.data?.sessionId && currentSessionId && msg.data.sessionId !== currentSessionId) return;

    if (msg.data?.sessionId && !currentSessionId) {
      sessionIdRef.current = msg.data.sessionId;
      setSessionId(msg.data.sessionId);
    }

    if (msg.event === 'agent:user-message') {
      const content = msg.data?.content;
      if (content) {
        finalize();
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          timestamp: Date.now(),
        }]);
        setIsRunning(true);
      }
      return;
    }

    if (msg.event === 'agent:message') {
      handleAgentMessage(msg.data);
    } else if (msg.event === 'agent:complete') {
      if (msg.data?.claudeSessionId) {
        setClaudeSessionId(msg.data.claudeSessionId);
      }
      finalize();
      setIsRunning(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleAgentMessage(d: any) {
    const content = d.message?.content;

    if (d.type === 'assistant' && Array.isArray(content)) {
      const rawUsage = d.usage || d.message?.usage;
      if (rawUsage) {
        const u = rawUsage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
        setUsage((prev) => ({
          contextUsed: u.input_tokens || prev.contextUsed,
          outputTotal: prev.outputTotal + (u.output_tokens || 0),
          cacheRead: prev.cacheRead + (u.cache_read_input_tokens || 0),
          turns: prev.turns + 1,
        }));
      }
      const msgId = getOrCreate();
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          streamingTextRef.current += block.text;
          const snapshot = streamingTextRef.current;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const blocks = [...(m.contentBlocks || [])];
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === 'text') {
                blocks[blocks.length - 1] = { type: 'text', text: lastBlock.text + block.text };
              } else {
                blocks.push({ type: 'text', text: block.text });
              }
              return { ...m, content: snapshot, contentBlocks: blocks };
            })
          );
        } else if (block.type === 'tool_use' && block.name === 'TodoWrite') {
          // Render as progress checklist instead of tool call
          const todos = (block.input?.todos as { content: string; status: string; activeForm?: string }[]) ?? [];
          const todosBlock: ContentBlock = {
            type: 'todos',
            todos: todos.map((t: { content: string; status: string; activeForm?: string }) => ({
              content: t.content,
              status: (t.status as 'pending' | 'in_progress' | 'completed') ?? 'pending',
              activeForm: t.activeForm,
            })),
          };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const blocks = [...(m.contentBlocks || [])];
              const existingIdx = blocks.findIndex((b) => b.type === 'todos');
              if (existingIdx >= 0) {
                blocks[existingIdx] = todosBlock;
              } else {
                blocks.push(todosBlock);
              }
              return { ...m, contentBlocks: blocks };
            })
          );
        } else if (block.type === 'tool_use') {
          const toolCall: ToolCallData = {
            id: block.id || crypto.randomUUID(),
            name: block.name || 'tool',
            input: block.input,
            isStreaming: true,
          };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const blocks = [...(m.contentBlocks || [])];
              blocks.push({ type: 'tool_use', tool: toolCall });
              return { ...m, toolCalls: [...(m.toolCalls || []), toolCall], contentBlocks: blocks };
            })
          );
        }
      }
    } else if (d.type === 'user' && Array.isArray(content)) {
      const msgId = streamingMsgId.current;
      if (!msgId) return;
      for (const block of content) {
        if (block.type === 'tool_result') {
          const toolId = block.tool_use_id;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const updateTool = (tc: ToolCallData) =>
                tc.id === toolId
                  ? { ...tc, result: block.content, isStreaming: false, isError: block.is_error }
                  : tc;
              const updatedTools = m.toolCalls?.map(updateTool);
              const updatedBlocks = m.contentBlocks?.map((b) =>
                b.type === 'tool_use' && b.tool.id === toolId
                  ? { ...b, tool: updateTool(b.tool) }
                  : b
              );
              return { ...m, toolCalls: updatedTools, contentBlocks: updatedBlocks };
            })
          );
        }
      }
      // Don't finalize here — keep accumulating into the same message
      // so consecutive tool calls group together. finalize() is called
      // on agent:complete or when a new user message arrives.
    } else if (d.type === 'system' && d.session_id) {
      setClaudeSessionId(d.session_id);
    }
  }
}

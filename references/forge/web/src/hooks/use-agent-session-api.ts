'use client';

import { useCallback } from 'react';
import type { ChatMessageData, ContentBlock } from '@/components/chat/chat-message';
import { agentApi, type AgentUsage } from '@/features/agent/api';

const EMPTY_USAGE: AgentUsage = { contextUsed: 0, outputTotal: 0, cacheRead: 0, turns: 0 };

interface UseAgentSessionApiOptions {
  projectSlug: string;
  mountedRef: React.MutableRefObject<boolean>;
  streamingMsgId: React.MutableRefObject<string | null>;
  streamingTextRef: React.MutableRefObject<string>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  sessionId: string | null;
  claudeSessionId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setClaudeSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setUsage: React.Dispatch<React.SetStateAction<AgentUsage>>;
  finalize: () => void;
}

export function useAgentSessionApi(opts: UseAgentSessionApiOptions) {
  const {
    projectSlug, mountedRef, streamingMsgId, streamingTextRef, wsRef,
    sessionId, claudeSessionId,
    setMessages, setIsRunning, setSessionId, setClaudeSessionId, setUsage,
    finalize,
  } = opts;

  const startAgent = useCallback(async (prompt: string, startOpts?: { preBuilt?: boolean; issueIds?: string[] }) => {
    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    streamingMsgId.current = null;
    streamingTextRef.current = '';
    setMessages((prev) => [...prev, userMsg]);
    setIsRunning(true);
    setUsage(EMPTY_USAGE);

    try {
      const res = await agentApi.start(projectSlug, prompt, undefined, startOpts?.preBuilt, startOpts?.issueIds);
      if (!mountedRef.current) return;
      const sid = res.data.documentId;
      setSessionId(sid);
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: sid }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to start agent'}`,
        timestamp: Date.now(),
      }]);
      setIsRunning(false);
    }
  }, [projectSlug, mountedRef, streamingMsgId, streamingTextRef, wsRef, setMessages, setIsRunning, setSessionId, setUsage]);

  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId) return;

    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    streamingMsgId.current = null;
    streamingTextRef.current = '';
    setMessages((prev) => [...prev, userMsg]);
    setIsRunning(true);

    try {
      await agentApi.send(sessionId, message, claudeSessionId || undefined);
    } catch (err) {
      if (!mountedRef.current) return;
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
        timestamp: Date.now(),
      }]);
      setIsRunning(false);
    }
  }, [sessionId, claudeSessionId, mountedRef, streamingMsgId, streamingTextRef, setMessages, setIsRunning]);

  const abortAgent = useCallback(async () => {
    if (!sessionId) return;
    try {
      await agentApi.abort(sessionId);
    } catch { /* ignore */ }
    finalize();
    setIsRunning(false);
  }, [sessionId, finalize, setIsRunning]);

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await agentApi.getSession(id);
      if (!mountedRef.current) return;
      const session = res.data;
      setSessionId(session.documentId);
      setClaudeSessionId(session.claudeSessionId || null);

      const stored = session.messages || [];
      const loaded: ChatMessageData[] = stored.map((m: any, i: number) => {
        const msg: ChatMessageData = {
          id: `stored-${i}`,
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: m.timestamp || Date.now(),
          toolCalls: m.toolCalls,
        };
        if (m.contentBlocks) {
          msg.contentBlocks = m.contentBlocks;
        } else if (msg.role === 'assistant' && (msg.toolCalls?.length || msg.content)) {
          const blocks: ContentBlock[] = [];
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              if (tc.name === 'TodoWrite') {
                const todos = (tc.input?.todos as { content: string; status: string; activeForm?: string }[]) ?? [];
                blocks.push({
                  type: 'todos',
                  todos: todos.map((t: { content: string; status: string; activeForm?: string }) => ({
                    content: t.content,
                    status: (t.status as 'pending' | 'in_progress' | 'completed') ?? 'pending',
                    activeForm: t.activeForm,
                  })),
                });
              } else {
                blocks.push({ type: 'tool_use', tool: tc });
              }
            }
          }
          if (msg.content) {
            blocks.push({ type: 'text', text: msg.content });
          }
          msg.contentBlocks = blocks;
        }
        return msg;
      }).filter((m: ChatMessageData) => m.content || m.toolCalls?.length || m.contentBlocks?.length);

      setMessages(loaded);
      streamingMsgId.current = null;
      streamingTextRef.current = '';

      if (session.usage && session.usage.turns > 0) {
        setUsage(session.usage);
      } else {
        setUsage(EMPTY_USAGE);
      }

      setIsRunning(session.status === 'running');
    } catch { /* ignore */ }
  }, [mountedRef, streamingMsgId, streamingTextRef, setMessages, setSessionId, setClaudeSessionId, setIsRunning, setUsage]);

  return { startAgent, sendMessage, abortAgent, loadSession };
}

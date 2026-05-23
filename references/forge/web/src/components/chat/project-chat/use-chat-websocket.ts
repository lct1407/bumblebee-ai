'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_URL } from '@/lib/api/client';
import type { ChatMessageData, ToolCallData } from '../chat-message';

interface UseChatWebSocketOptions {
  sessionId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
}

export function useChatWebSocket({ sessionId, setMessages }: UseChatWebSocketOptions) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const wsRef = useRef<WebSocket | null>(null);
  const streamingMsgId = useRef<string | null>(null);

  const subscribeToSession = useCallback((sid: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: sid }));
    }
  }, []);

  const unsubscribeFromSession = useCallback((sid: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', sessionId: sid }));
    }
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (sessionId) subscribeToSession(sessionId);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Invalidate board/list queries on data-change broadcasts
        if (msg.event?.startsWith('issue:') || msg.event?.startsWith('task:') || msg.event?.startsWith('agent:')) {
          const qc = queryClientRef.current;
          const keys = msg.event.startsWith('task:') || msg.event.startsWith('agent:')
            ? ['tasks']
            : ['issues', 'issue', 'comments'];
          keys.forEach((k) => qc.invalidateQueries({ queryKey: [k], refetchType: 'all' }));
        }

        const msgId = streamingMsgId.current;
        if (!msgId) return;

        if (msg.event === 'chat:text_delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, content: m.content + (msg.data?.text || '') } : m
            )
          );
        } else if (msg.event === 'chat:tool_use') {
          const toolCall: ToolCallData = {
            id: msg.data?.id || crypto.randomUUID(),
            name: msg.data?.name || 'tool',
            isStreaming: true,
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                : m
            )
          );
        } else if (msg.event === 'chat:done') {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId) return m;
              const updatedTools = m.toolCalls?.map((tc) => ({ ...tc, isStreaming: false }));
              return { ...m, isStreaming: false, toolCalls: updatedTools };
            })
          );
          streamingMsgId.current = null;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => ws.close();

    return () => {
      ws.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe when sessionId changes
  useEffect(() => {
    if (sessionId) subscribeToSession(sessionId);
    return () => {
      if (sessionId) unsubscribeFromSession(sessionId);
    };
  }, [sessionId, subscribeToSession, unsubscribeFromSession]);

  return { wsRef, streamingMsgId, subscribeToSession };
}

'use client';

import { useCallback, useEffect } from 'react';
import { agentApi } from '@/features/agent/api';
import { finalizeAssistantMsg } from '@/lib/agent-stream-utils';
import { useAgentMessageState } from './use-agent-message-state';
import { useAgentWebSocket } from './use-agent-websocket';
import { useAgentSessionApi } from './use-agent-session-api';
import { useAgentPromptBuild } from './use-agent-prompt-build';

interface UseAgentStreamOptions {
  projectSlug: string;
}

export function useAgentStream({ projectSlug }: UseAgentStreamOptions) {
  const state = useAgentMessageState();
  const {
    messages, setMessages, isRunning, setIsRunning,
    sessionId, setSessionId, claudeSessionId, setClaudeSessionId,
    desktopConnected, setDesktopConnected,
    usage, setUsage,
    mountedRef, sessionIdRef, streamingMsgId, streamingTextRef,
    clearStreamState, EMPTY_USAGE,
  } = state;

  const promptBuild = useAgentPromptBuild(projectSlug, clearStreamState);
  const {
    draftPrompt, setDraftPrompt,
    isBuildingPrompt,
    pendingIssueIds, setPendingIssueIds,
    requestBuildPrompt, clearDraftPrompt,
    handlePromptBuilt, handlePreviewPrompt,
  } = promptBuild;

  const { wsRef } = useAgentWebSocket({
    projectSlug,
    sessionIdRef, mountedRef, streamingMsgId, streamingTextRef,
    setMessages, setIsRunning, setSessionId, setClaudeSessionId,
    setDesktopConnected, setUsage,
    setDraftPrompt, setPendingIssueIds,
    handlePromptBuilt, handlePreviewPrompt,
  });

  const finalize = useCallback(() => {
    finalizeAssistantMsg(streamingMsgId, streamingTextRef, setMessages);
  }, [streamingMsgId, streamingTextRef, setMessages]);

  const { startAgent, sendMessage, abortAgent, loadSession } = useAgentSessionApi({
    projectSlug, mountedRef, streamingMsgId, streamingTextRef, wsRef,
    sessionId, claudeSessionId,
    setMessages, setIsRunning, setSessionId, setClaudeSessionId, setUsage,
    finalize,
  });

  // Subscribe when sessionId changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && sessionId) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }
  }, [sessionId, wsRef]);

  // Fallback: poll session status while running
  useEffect(() => {
    if (!isRunning || !sessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await agentApi.getSession(sessionId);
        const status = res.data?.status;
        if (status && status !== 'running') {
          finalize();
          setIsRunning(false);
        }
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [isRunning, sessionId, finalize, setIsRunning]);

  const resetSession = useCallback(() => {
    clearStreamState();
  }, [clearStreamState]);

  return {
    messages,
    isRunning,
    sessionId,
    desktopConnected,
    draftPrompt,
    isBuildingPrompt,
    pendingIssueIds,
    startAgent,
    sendMessage,
    abortAgent,
    loadSession,
    resetSession,
    requestBuildPrompt,
    clearDraftPrompt,
    usage,
  };
}

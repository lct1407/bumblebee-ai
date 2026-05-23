'use client';

import { Plus, Monitor, MonitorOff } from 'lucide-react';
import { SessionList } from '@/components/chat/session-list';
import { Button, StatusDot } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import type { AgentSessionSummary } from '@/features/agent/api';

interface AgentSidebarProps {
  slug: string;
  sessions: AgentSessionSummary[];
  loadingSessions: boolean;
  activeSessionId: string | null;
  desktopConnected: boolean;
  showSessions: boolean;
  onNewChat: () => void;
  onSelectSession: (session: AgentSessionSummary) => void;
  onSearch: (query: string) => void;
}

export function AgentSidebar({
  slug,
  sessions,
  loadingSessions,
  activeSessionId,
  desktopConnected,
  showSessions,
  onNewChat,
  onSelectSession,
  onSearch,
}: AgentSidebarProps) {
  return (
    <div className={cn(
      'w-full shrink-0 border-r border-[#333333] flex flex-col bg-[#111111] md:w-64',
      !showSessions && 'hidden md:flex',
    )}>
      <div className="flex items-center justify-between border-b border-[#333333] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#cccccc]">Sessions</h3>
        <Button size="xs" onClick={onNewChat} className="flex items-center gap-1">
          <Plus className="h-3 w-3" />
          New
        </Button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#333333] text-xs">
        {desktopConnected ? (
          <>
            <Monitor className="h-3.5 w-3.5 text-green-500" />
            <span className="text-green-400">Desktop connected</span>
          </>
        ) : (
          <>
            <MonitorOff className="h-3.5 w-3.5 text-[#555555]" />
            <span className="text-[#555555]">Desktop offline</span>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SessionList
          sessions={sessions}
          loading={loadingSessions}
          activeSessionId={activeSessionId}
          onSelect={onSelectSession}
          onNew={onNewChat}
          statusDot={(s) => <StatusDot status={s.status} />}
          getHref={(s) => `/projects/${slug}/agent?session=${s.documentId}`}
          theme="dark"
          onSearch={onSearch}
        />
      </div>
    </div>
  );
}

'use client';

import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { AgentSessionSummary } from '../../api';

interface AgentRecentSessionsProps {
  sessions: AgentSessionSummary[];
  onSessionClick: (sessionId: string) => void;
}

export function AgentRecentSessions({ sessions, onSessionClick }: AgentRecentSessionsProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="border-t border-gray-100 p-5">
      <h4 className="mb-3 text-sm font-medium text-gray-700">Recent Runs</h4>
      <div className="space-y-1.5">
        {sessions.map((s) => (
          <button
            key={s.documentId}
            onClick={() => onSessionClick(s.documentId)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            {s.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            ) : s.status === 'running' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
            ) : s.status === 'failed' ? (
              <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            <span className="min-w-0 flex-1 truncate text-gray-800">{s.title}</span>
            <span className="shrink-0 text-xs text-gray-400">
              {new Date(s.createdAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils/cn';
import { MessageSquare } from 'lucide-react';

interface AgentSession {
  id: number;
  documentId: string;
  title: string;
  status: string;
}

interface IssueAgentSessionsProps {
  sessions: AgentSession[];
  onSelect: (documentId: string) => void;
}

export function IssueAgentSessions({ sessions, onSelect }: IssueAgentSessionsProps) {
  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="px-4 py-3 sm:px-6">
      <h3 className="mb-2 text-sm font-semibold">Agent Sessions</h3>
      <ul className="space-y-1.5">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.documentId)}
              className="flex w-full items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                s.status === 'completed' ? 'bg-green-100 text-green-700' :
                s.status === 'running' ? 'bg-blue-100 text-blue-700' :
                s.status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              )}>
                {s.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

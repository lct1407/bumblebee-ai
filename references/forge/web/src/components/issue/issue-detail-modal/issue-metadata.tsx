'use client';

import { cn } from '@/lib/utils/cn';
import { AGENT_STATUS_COLORS } from '@/lib/constants';
import { InlineStatusSelect } from '@/components/issue/inline-status-select';
import { InlinePrioritySelect } from '@/components/issue/inline-priority-select';
import { Play, Loader2 } from 'lucide-react';
import type { Issue } from '@/features/issue/types';

interface IssueMetadataProps {
  issue: Issue;
  desktopConnected: boolean;
  isBuildingPrompt: boolean;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onEnrich: (id: string) => void;
  onStartSession: () => void;
}

export function IssueMetadata({ issue, desktopConnected, isBuildingPrompt, onUpdate, onEnrich, onStartSession }: IssueMetadataProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-4 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Status</span>
        <InlineStatusSelect
          issue={issue}
          onUpdate={(id, data) => onUpdate(id, data)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Priority</span>
        <InlinePrioritySelect
          issue={issue}
          onUpdate={(id, data) => onUpdate(id, data)}
        />
      </div>
      {issue.category && (
        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{issue.category}</span>
      )}
      {issue.agentStatus && (
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', AGENT_STATUS_COLORS[issue.agentStatus] ?? 'bg-gray-100')}>
          Agent: {issue.agentStatus}
        </span>
      )}
      {issue.status === 'open' && (
        <button
          onClick={() => onEnrich(issue.documentId)}
          className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          Enrich
        </button>
      )}
      {desktopConnected && issue.status !== 'resolved' && issue.status !== 'closed' && (
        <button
          onClick={onStartSession}
          disabled={isBuildingPrompt}
          className="flex items-center gap-1 rounded bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isBuildingPrompt ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          Start Session
        </button>
      )}
    </div>
  );
}

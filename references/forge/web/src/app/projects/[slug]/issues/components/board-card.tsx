'use client';

import { AgentRunningDot } from '@/components/ui';
import { InlinePrioritySelect } from '@/components/issue/inline-priority-select';
import { InlineStatusSelect } from '@/components/issue/inline-status-select';
import type { Issue } from '@/features/issue/types';

interface BoardCardProps {
  issue: Issue;
  onUpdate: (id: string, data: Partial<Issue>) => void;
  onSelect: (id: string) => void;
}

export function BoardCard({ issue, onUpdate, onSelect }: BoardCardProps) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <button
        onClick={() => onSelect(issue.documentId)}
        className="block text-left text-sm font-medium hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded"
      >
        <span className="mr-1 font-mono text-[10px] text-gray-400">ISS-{issue.id}</span>
        {issue.title}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <InlinePrioritySelect issue={issue} onUpdate={onUpdate} />
        <InlineStatusSelect issue={issue} onUpdate={onUpdate} />
      </div>
      {issue.agentStatus && issue.agentStatus !== 'idle' && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600">
          {issue.agentStatus === 'running' && <AgentRunningDot size="sm" />}
          {issue.agentStatus}
        </div>
      )}
    </div>
  );
}

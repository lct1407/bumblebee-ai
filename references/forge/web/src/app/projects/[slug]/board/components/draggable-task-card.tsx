'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { AgentRunningDot, AgentStatusIndicator, PriorityBadge } from '@/components/ui';
import { DRAGGABLE_CARD_CLASS } from '../constants';
import type { Task } from '@/features/task/types';

interface DraggableTaskCardProps {
  task: Task;
  highlight?: boolean;
}

export function DraggableTaskCard({ task, highlight }: DraggableTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', task.documentId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(DRAGGABLE_CARD_CLASS, highlight && 'ring-2 ring-blue-400 animate-highlight-fade')}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{task.title}</p>
        {task.isAgentTask && <AgentStatusIndicator status={task.agentStatus} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.priority && task.priority !== 'none' && (
          <PriorityBadge priority={task.priority} />
        )}
        {task.isAgentTask && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">agent</span>
        )}
        {task.assignee && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{task.assignee}</span>
        )}
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-2 text-xs text-gray-600">
          {task.description && <p>{task.description}</p>}
          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div>
              <span className="font-medium text-gray-700">Acceptance criteria:</span>
              <ul className="mt-0.5 list-inside list-disc">
                {task.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {task.agentStatus === 'running' && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <AgentRunningDot size="sm" />
              Agent running...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

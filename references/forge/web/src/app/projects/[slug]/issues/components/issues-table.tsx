'use client';

import { Play, Loader2 } from 'lucide-react';
import { Checkbox, AgentRunningDot } from '@/components/ui';
import { InlineStatusSelect } from '@/components/issue/inline-status-select';
import { InlinePrioritySelect } from '@/components/issue/inline-priority-select';
import { cn } from '@/lib/utils/cn';
import { relativeTime } from '@/lib/utils/relative-time';
import { IssuesPagination } from './issues-pagination';
import type { Issue } from '@/features/issue/types';

interface IssuesTableProps {
  paginated: Issue[];
  total: number;
  checked: Set<string>;
  pageCount: number;
  safePage: number;
  slug: string;
  desktopConnected: boolean;
  isBuildingPrompt: boolean;
  onToggleCheck: (docId: string) => void;
  onSelectAll: () => void;
  onSelectIssue: (id: string) => void;
  onUpdate: (id: string, data: Partial<Issue>) => void;
  onStartSingle: (docId: string) => void;
  onEnrich: (docId: string) => void;
  setParam: (key: string, value: string) => void;
}

export function IssuesTable({
  paginated,
  total,
  checked,
  pageCount,
  safePage,
  desktopConnected,
  isBuildingPrompt,
  onToggleCheck,
  onSelectAll,
  onSelectIssue,
  onUpdate,
  onStartSingle,
  onEnrich,
  setParam,
}: IssuesTableProps) {
  const allChecked = paginated.length > 0 && paginated.every((i) => checked.has(i.documentId));

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-3 py-3 w-10">
              <Checkbox
                aria-label="Select all issues on this page"
                checked={allChecked}
                onChange={onSelectAll}
                className="h-3.5 w-3.5"
              />
            </th>
            <th className="hidden px-3 py-3 w-20 sm:table-cell">ID</th>
            <th className="px-3 py-3 sm:px-4">Title</th>
            <th className="hidden px-3 py-3 w-36 sm:table-cell sm:px-4">Status</th>
            <th className="hidden px-4 py-3 w-32 md:table-cell">Priority</th>
            <th className="hidden px-4 py-3 w-28 lg:table-cell">Reporter</th>
            <th className="hidden px-4 py-3 w-28 lg:table-cell">Updated</th>
            <th className="px-3 py-3 w-16 sm:w-20 sm:px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {paginated.map((issue) => (
            <tr
              key={issue.id}
              className={cn('cursor-pointer hover:bg-gray-50', checked.has(issue.documentId) && 'bg-blue-50/50')}
              tabIndex={0}
              onClick={() => onSelectIssue(issue.documentId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectIssue(issue.documentId);
                }
              }}
            >
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={`Select issue ISS-${issue.id}`}
                  checked={checked.has(issue.documentId)}
                  onChange={() => onToggleCheck(issue.documentId)}
                  className="h-3.5 w-3.5"
                />
              </td>
              <td className="hidden px-3 py-3 sm:table-cell">
                <span className="font-mono text-xs text-gray-400">ISS-{issue.id}</span>
              </td>
              <td className="px-3 py-3 sm:px-4">
                <div className="font-medium text-gray-900 line-clamp-2 sm:line-clamp-1">
                  <span className="mr-1.5 font-mono text-xs text-gray-400 sm:hidden">ISS-{issue.id}</span>
                  {issue.title}
                </div>
                {issue.agentStatus && issue.agentStatus !== 'idle' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                    {issue.agentStatus === 'running' && <AgentRunningDot size="sm" />}
                    {issue.agentStatus}
                  </span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                  <InlineStatusSelect issue={issue} onUpdate={onUpdate} />
                  <InlinePrioritySelect issue={issue} onUpdate={onUpdate} />
                </div>
              </td>
              <td className="hidden px-3 py-3 sm:table-cell sm:px-4">
                <InlineStatusSelect issue={issue} onUpdate={onUpdate} />
              </td>
              <td className="hidden px-4 py-3 md:table-cell">
                <InlinePrioritySelect issue={issue} onUpdate={onUpdate} />
              </td>
              <td className="hidden px-4 py-3 text-xs text-gray-500 lg:table-cell">
                {issue.reportedBy ?? '-'}
              </td>
              <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
                {relativeTime(issue.updatedAt)}
              </td>
              <td className="px-4 py-3">
                {desktopConnected && issue.status !== 'resolved' && issue.status !== 'closed' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartSingle(issue.documentId); }}
                    disabled={isBuildingPrompt}
                    className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isBuildingPrompt ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Start
                  </button>
                ) : issue.status === 'open' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnrich(issue.documentId); }}
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    Enrich
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <IssuesPagination
        total={total}
        pageCount={pageCount}
        safePage={safePage}
        setParam={setParam}
      />
    </div>
  );
}

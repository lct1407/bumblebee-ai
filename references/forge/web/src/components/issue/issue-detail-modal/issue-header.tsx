'use client';

import { EditableField } from './editable-field';
import type { Issue } from '@/features/issue/types';

interface IssueHeaderProps {
  issue: Issue;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
}

export function IssueHeader({ issue, onClose, onUpdate }: IssueHeaderProps) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="min-w-0 text-lg font-bold">
          <span className="font-mono text-sm text-gray-400">[ISS-{issue.id}]</span>{' '}
          {issue.title}
        </h2>
        <button onClick={onClose} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {issue.reportedBy && (
        <p className="mt-1 text-xs text-gray-400">Reported by {issue.reportedBy}</p>
      )}
      <div className="mt-2">
        <EditableField
          value={issue.description}
          placeholder="No description"
          title="Edit description"
          rows={5}
          onSave={(v) => onUpdate(issue.documentId, { description: v })}
        />
      </div>
      {/* Acceptance Criteria & Suggested Solution */}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-1 text-sm font-semibold">Acceptance Criteria</h3>
          <EditableField
            value={issue.acceptanceCriteria}
            placeholder="Not defined yet"
            title="Edit acceptance criteria"
            onSave={(v) => onUpdate(issue.documentId, { acceptanceCriteria: v })}
          />
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 text-sm font-semibold">Suggested Solution</h3>
          <EditableField
            value={issue.suggestedSolution}
            placeholder="Not defined yet"
            title="Edit suggested solution"
            onSave={(v) => onUpdate(issue.documentId, { suggestedSolution: v })}
          />
        </div>
      </div>
    </div>
  );
}

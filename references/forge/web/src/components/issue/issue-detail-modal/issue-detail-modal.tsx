'use client';

import { useEffect } from 'react';
import { useIssue, useUpdateIssue, useEnrichIssue } from '@/features/issue/hooks/use-issues';
import { useComments, useCreateComment } from '@/features/comment/hooks/use-comments';
import { useRouter, useParams } from 'next/navigation';
import { useAgentStreamContext } from '@/hooks/agent-stream-context';
import { IssueHeader } from './issue-header';
import { IssuePlan } from './issue-plan';
import { IssueMetadata } from './issue-metadata';
import { IssueAgentSessions } from './issue-agent-sessions';
import { IssueAttachments } from './issue-attachments';
import { IssueEnrichment } from './issue-enrichment';
import { IssueTasks } from './issue-tasks';
import { IssueHistory } from './issue-history';
import { IssueComments } from './issue-comments';

interface Props {
  issueId: string;
  onClose: () => void;
}

export function IssueDetailModal({ issueId, onClose }: Props) {
  const { data, isLoading } = useIssue(issueId);
  const issue = data?.data;
  const updateIssue = useUpdateIssue();
  const enrichIssue = useEnrichIssue();
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const { desktopConnected, requestBuildPrompt, isBuildingPrompt } = useAgentStreamContext();
  const { data: commentsData } = useComments(issue?.documentId ?? '');
  const comments = commentsData?.data ?? [];
  const createComment = useCreateComment(issue?.documentId ?? '');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleUpdate = (id: string, data: Record<string, any>) => {
    updateIssue.mutate({ id, data });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-[3vh] sm:p-4 sm:pt-[10vh]" onClick={onClose}>
      <div
        data-paste-zone
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-xl border bg-white shadow-xl sm:max-h-[85dvh] lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
        ) : !issue ? (
          <div className="p-8 text-center text-sm text-gray-500">Issue not found.</div>
        ) : (
          <div className="divide-y min-w-0">
            <IssueHeader issue={issue} onClose={onClose} onUpdate={handleUpdate} />

            {issue.plan && <IssuePlan plan={issue.plan} />}

            <IssueMetadata
              issue={issue}
              desktopConnected={desktopConnected}
              isBuildingPrompt={isBuildingPrompt}
              onUpdate={handleUpdate}
              onEnrich={(id) => enrichIssue.mutate(id)}
              onStartSession={async () => {
                await requestBuildPrompt([issue.documentId]);
                onClose();
                router.push(`/projects/${slug}/agent`);
              }}
            />

            <IssueAgentSessions
              sessions={issue.agentSessions ?? []}
              onSelect={(docId) => {
                onClose();
                router.push(`/projects/${slug}/agent?session=${docId}`);
              }}
            />

            <IssueAttachments
              attachments={issue.attachments ?? []}
              issueDocumentId={issue.documentId}
              onUpdate={handleUpdate}
            />

            <IssueEnrichment issue={issue} />

            <IssueTasks tasks={issue.tasks ?? []} />

            <IssueHistory history={issue.changeHistory ?? []} />

            <IssueComments
              comments={comments}
              onAddComment={(body) => {
                createComment.mutate(
                  { body, issue: issue.documentId },
                );
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCreateIssue } from '@/features/issue/hooks/use-issues';
import { useState } from 'react';
import { issueApi } from '@/features/issue/api/issue-api';
import { useProject } from '@/features/project/hooks/use-projects';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Button } from '@/components/ui/button';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import type { IssuePriority } from '@/features/issue/types';

export default function NewIssuePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: projectData } = useProject(slug);
  const project = projectData?.data;
  const createIssue = useCreateIssue();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [suggestedSolution, setSuggestedSolution] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await createIssue.mutateAsync({
        title,
        description,
        priority,
        project: project.documentId,
        ...(acceptanceCriteria.trim() ? { acceptanceCriteria } : {}),
        ...(suggestedSolution.trim() ? { suggestedSolution } : {}),
        ...(attachments.length > 0 ? { attachments: attachments.map((a) => a.id) } : {}),
      });
      router.push(`/projects/${slug}/issues`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl pb-8">
      <h2 className="mb-4 text-lg font-bold sm:text-xl">Create New Issue</h2>
      {error && (
        <AlertBanner variant="error">{error}</AlertBanner>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Issue title"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Describe the issue..."
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="acceptanceCriteria" className="mb-1 block text-sm font-medium">
              Acceptance Criteria
            </label>
            <textarea
              id="acceptanceCriteria"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="What needs to be true for this issue to be considered done..."
            />
          </div>
          <div>
            <label htmlFor="suggestedSolution" className="mb-1 block text-sm font-medium">
              Suggested Solution
            </label>
            <textarea
              id="suggestedSolution"
              value={suggestedSolution}
              onChange={(e) => setSuggestedSolution(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="How this issue could be resolved..."
            />
          </div>
        </div>

        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as IssuePriority)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Attachments</label>
          <FileUpload
            value={attachments}
            onChange={setAttachments}
            uploadFn={issueApi.uploadFile}
          />
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? 'Creating...' : 'Create Issue'}
          </Button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

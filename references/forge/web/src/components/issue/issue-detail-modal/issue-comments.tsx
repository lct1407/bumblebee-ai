'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Markdown } from '@/components/ui/markdown';
import { Button } from '@/components/ui/button';

interface Comment {
  id: number;
  author: string;
  body: string;
  isAI?: boolean;
  createdAt: string;
}

interface IssueCommentsProps {
  comments: Comment[];
  onAddComment: (body: string) => void;
}

export function IssueComments({ comments, onAddComment }: IssueCommentsProps) {
  const [commentBody, setCommentBody] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    onAddComment(commentBody);
    setCommentBody('');
  };

  return (
    <div className="px-4 py-4 sm:px-6">
      <h3 className="mb-2 text-sm font-semibold">Comments</h3>
      {comments.length === 0 ? (
        <p className="text-xs text-gray-400">No comments yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={cn('rounded-lg border p-2.5', c.isAI ? 'border-blue-100 bg-blue-50' : 'bg-gray-50')}>
              <p className="mb-0.5 text-[10px] font-medium text-gray-400">
                {c.author}{c.isAI ? ' (AI)' : ''} · {new Date(c.createdAt).toLocaleString()}
              </p>
              <Markdown className="text-sm">{c.body}</Markdown>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
        />
        <Button type="submit" disabled={!commentBody.trim()} size="sm">
          Comment
        </Button>
      </form>
    </div>
  );
}

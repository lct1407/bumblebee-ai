import { useState, useEffect } from "react";
import type { Comment } from "@/lib/types";
import { getComments, createComment } from "@/lib/api";
import { Markdown } from "../ui/markdown";
import { useMountedRef } from "@/hooks/use-mounted-ref";

interface Props {
  issueDocumentId: string;
  initialComments: Comment[];
}

export function IssueComments({ issueDocumentId, initialComments }: Props) {
  const [commentBody, setCommentBody] = useState("");
  const [comments, setComments] = useState(initialComments);
  const [submittingComment, setSubmittingComment] = useState(false);
  const mountedRef = useMountedRef();

  useEffect(() => {
    getComments(issueDocumentId).then((data) => {
      if (mountedRef.current) setComments(data);
    }).catch(() => {});
  }, [issueDocumentId]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const newComment = await createComment({ body: commentBody, issue: issueDocumentId });
      if (mountedRef.current) {
        setComments((prev) => [...prev, newComment]);
        setCommentBody("");
      }
    } catch {} finally {
      if (mountedRef.current) setSubmittingComment(false);
    }
  }

  return (
    <div className="px-6 py-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Comments</h3>
      {comments.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">No comments yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className={`rounded-lg border p-2.5 ${c.isAI ? "border-blue-100 bg-blue-50" : "bg-gray-50"}`}>
              <p className="mb-0.5 text-[10px] font-medium text-gray-400">
                {c.author}{c.isAI ? " (AI)" : ""} · {new Date(c.createdAt).toLocaleString()}
              </p>
              <Markdown>{c.body}</Markdown>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAddComment} className="flex gap-2">
        <input
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!commentBody.trim() || submittingComment}
          className="rounded-lg bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Comment
        </button>
      </form>
    </div>
  );
}

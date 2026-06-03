"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CommentsApi } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

function initials(name: string | null) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

export function Comments({ project, number }: { project: string; number: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const list = useQuery({
    queryKey: ["comments", project, number],
    queryFn: () => CommentsApi.list(project, number),
  });

  const post = useMutation({
    mutationFn: () => CommentsApi.create(project, number, { body: text.trim(), author: "You" }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", project, number] });
    },
  });

  const comments = list.data ?? [];

  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="t-overline" style={{ color: "var(--text-tertiary)" }}>Discussion</h2>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {comments.length}
        </span>
      </div>

      <div className="space-y-4">
        {comments.length === 0 && (
          <p className="t-small italic" style={{ color: "var(--text-tertiary)" }}>
            No comments yet. Mention a teammate with @username.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
              style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}
            >
              {initials(c.author)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {c.author || "Unknown"}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-quaternary)" }}>
                  {formatRelativeTime(c.created_at)}
                </span>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {c.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form
        className="mt-5 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) post.mutate();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment… use @username to notify a teammate"
          className="flex-1 min-h-[62px] resize-y px-3 py-2 text-sm rounded-[5px] border outline-none focus:border-[var(--accent)]"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={!text.trim() || post.isPending}
          className="self-end px-4 py-2 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {post.isPending ? "…" : "Comment"}
        </button>
      </form>
    </section>
  );
}

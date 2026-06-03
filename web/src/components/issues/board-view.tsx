"use client";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IssuesApi, type Issue } from "@/lib/api-client";
import { PriorityBadge } from "@/components/ui/badge";
import { TypeIcon } from "@/components/ui/type-icon";
import { cn } from "@/lib/utils";

const COLUMNS: { id: string; label: string; accent: string }[] = [
  { id: "new", label: "New", accent: "var(--status-info)" },
  { id: "triaged", label: "Triaged", accent: "var(--status-purple)" },
  { id: "planned", label: "Planned", accent: "var(--status-purple)" },
  { id: "in_progress", label: "In Progress", accent: "var(--status-warning)" },
  { id: "in_review", label: "In Review", accent: "var(--status-purple)" },
  { id: "closed", label: "Closed", accent: "var(--status-success)" },
];

export function BoardView({
  issues,
  project,
  onSelect,
}: {
  issues: Issue[];
  project: string;
  onSelect: (i: Issue) => void;
}) {
  const qc = useQueryClient();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({ number, status }: { number: number; status: string }) =>
      IssuesApi.update(project, number, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {COLUMNS.map((col) => {
          const items = issues.filter((i) => i.status === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const data = e.dataTransfer.getData("application/json");
                if (data) {
                  const issue = JSON.parse(data) as Issue;
                  if (issue.status !== col.id) {
                    update.mutate({ number: issue.number, status: col.id });
                  }
                }
              }}
              className={cn(
                "w-72 flex-shrink-0 rounded-lg border transition",
                dragOver === col.id && "ring-2",
              )}
              style={{
                background: "var(--bg-surface)",
                borderColor: dragOver === col.id ? "var(--accent)" : "var(--border)",
                boxShadow: dragOver === col.id ? "0 0 0 3px var(--accent-subtle)" : "none",
              }}
            >
              <header className="px-3 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.accent }} />
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{col.label}</span>
                  <span
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded tabular-nums"
                    style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
                  >
                    {items.length}
                  </span>
                </div>
                <button
                  className="w-6 h-6 rounded transition flex items-center justify-center hover:bg-[var(--bg-subtle)]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </header>
              <div className="p-2 space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-quaternary)" }}>
                    Drop here
                  </div>
                )}
                {items.map((issue, idx) => (
                  <motion.div
                    key={issue.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.025 }}
                    draggable
                    onDragStart={(e: any) => e.dataTransfer.setData("application/json", JSON.stringify(issue))}
                    onClick={() => onSelect(issue)}
                    className="rounded-md border p-2.5 cursor-grab active:cursor-grabbing transition"
                    style={{
                      background: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                    }}
                    whileHover={{ y: -1, boxShadow: "var(--shadow-md)" }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                        {project.toUpperCase()}-{issue.number}
                      </span>
                      <span style={{ color: "var(--text-tertiary)" }}><TypeIcon type={issue.type} size={14} className="flex-shrink-0" /></span>
                    </div>
                    <h4
                      className="text-sm font-medium leading-snug mb-2 line-clamp-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {issue.title}
                    </h4>
                    <div className="flex items-center justify-between gap-2">
                      <PriorityBadge priority={issue.priority} />
                      {issue.ai_confidence != null && (
                        <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                          {Math.round(issue.ai_confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

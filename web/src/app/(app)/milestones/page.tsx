"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MilestonesApi, type Milestone } from "@/lib/api-client";
import { useActiveProject } from "@/lib/use-active-project";

const STATUS_TONE: Record<string, string> = {
  planned: "var(--status-neutral)",
  active: "var(--status-warning)",
  completed: "var(--status-success)",
  cancelled: "var(--status-danger)",
};

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function MilestonesPage() {
  const qc = useQueryClient();
  const { project } = useActiveProject();
  const [name, setName] = useState("");
  const [due, setDue] = useState("");

  const list = useQuery({
    queryKey: ["milestones", project],
    queryFn: () => MilestonesApi.list(project!),
    enabled: !!project,
  });

  const create = useMutation({
    mutationFn: () => MilestonesApi.create(project!, { name: name.trim(), due_date: due || null, status: "active" }),
    onSuccess: () => {
      setName("");
      setDue("");
      qc.invalidateQueries({ queryKey: ["milestones", project] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => MilestonesApi.remove(project!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["milestones", project] }),
  });

  const milestones = list.data ?? [];

  return (
    <div className="space-y-6">
      <div className="masthead flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Milestones</h1>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            Time-boxed delivery goals · project{" "}
            <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{project ?? "…"}</code>
          </p>
        </div>
      </div>

      {/* Create */}
      <form
        className="flex flex-wrap items-end gap-3 rounded-[6px] border p-4"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
      >
        <div className="flex-1 min-w-[200px]">
          <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sprint 12 · Auth & billing"
            className="w-full px-3 py-2 text-sm border rounded-[5px] outline-none focus:border-[var(--accent)]"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
          />
        </div>
        <div>
          <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Due date</label>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="px-3 py-2 text-sm border rounded-[5px] outline-none focus:border-[var(--accent)]"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
          />
        </div>
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="px-4 py-2 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {create.isPending ? "Adding…" : "Add milestone"}
        </button>
      </form>

      {/* List */}
      {list.isLoading ? (
        <div className="h-24 rounded-[6px] animate-pulse" style={{ background: "var(--bg-subtle)" }} />
      ) : milestones.length === 0 ? (
        <div className="text-center py-16 rounded-[6px] border" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
          No milestones yet. Create one to start tracking progress.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {milestones.map((m) => (
            <MilestoneCard key={m.id} m={m} onDelete={() => remove.mutate(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneCard({ m, onDelete }: { m: Milestone; onDelete: () => void }) {
  const due = fmtDate(m.due_date);
  return (
    <div className="rounded-[6px] border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_TONE[m.status] }} />
            <h3 className="font-semibold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>{m.name}</h3>
          </div>
          {m.description && (
            <p className="text-sm mt-1.5" style={{ color: "var(--text-tertiary)" }}>{m.description}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="text-[11px] px-2 py-1 rounded transition hover:bg-[var(--bg-subtle)]"
          style={{ color: "var(--text-quaternary)" }}
          title="Delete milestone"
        >
          Delete
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-mono uppercase tracking-wide">{m.status}</span>
          <span className="font-mono tabular-nums">{m.done_issues}/{m.total_issues} done · {m.progress_pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${m.progress_pct}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {due && (
        <div className="mt-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Due {due}
        </div>
      )}
    </div>
  );
}

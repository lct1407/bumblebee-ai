"use client";
import { motion } from "framer-motion";
import type { AgentEvent } from "@/lib/api-client";
import { formatRelativeTime, cn } from "@/lib/utils";

interface Run {
  runId: string;
  workflowName: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed";
  costUsd: number;
  llmCalls: number;
  errors: string[];
}

export function WorkflowRuns({ events }: { events: AgentEvent[] }) {
  const runs = aggregateRuns(events);

  if (!runs.length) {
    return (
      <div className="text-center py-12 t-small" style={{ color: "var(--text-tertiary)" }}>
        No workflow runs yet. Click "Trigger workflow" to start one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run, idx) => (
        <motion.div
          key={run.runId}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.03 }}
          className="rounded-lg border p-3"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-start gap-3">
            <RunStatusDot status={run.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                    {run.workflowName || "workflow"}
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    #{run.runId.slice(0, 8)}
                  </span>
                </div>
                <span className="t-tiny tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  {formatRelativeTime(run.startedAt)}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-[11px]">
                <Stat label="Status" value={run.status} valueColor={statusColor(run.status)} />
                <Stat label="LLM calls" value={String(run.llmCalls)} />
                <Stat label="Cost" value={`$${run.costUsd.toFixed(4)}`} mono />
                {run.endedAt && (
                  <Stat
                    label="Duration"
                    value={duration(run.startedAt, run.endedAt)}
                    mono
                  />
                )}
              </div>
              {run.errors.length > 0 && (
                <div
                  className="mt-2 text-[11px] p-2 rounded border-l-2 font-mono"
                  style={{
                    background: "var(--bg-subtle)",
                    borderColor: "var(--status-danger)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {run.errors[0].slice(0, 200)}
                  {run.errors[0].length > 200 && "…"}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function RunStatusDot({ status }: { status: Run["status"] }) {
  return (
    <span
      className={cn(
        "flex-shrink-0 w-2 h-2 rounded-full mt-2",
        status === "running" && "animate-pulse",
      )}
      style={{ background: statusColor(status) }}
    />
  );
}

function Stat({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span
        className={mono ? "font-mono tabular-nums" : ""}
        style={{ color: valueColor || "var(--text-primary)", fontWeight: 500 }}
      >
        {value}
      </span>
    </span>
  );
}

function statusColor(s: Run["status"]) {
  return s === "running"
    ? "var(--status-info)"
    : s === "completed"
    ? "var(--status-success)"
    : "var(--status-danger)";
}

function duration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Aggregate `workflow_run_id` from events into per-run summaries. */
function aggregateRuns(events: AgentEvent[]): Run[] {
  const byRun = new Map<string, Run>();

  for (const e of events) {
    const runId =
      e.payload?.workflow_run_id ||
      e.payload?.run_id ||
      (e.type.includes("workflow") ? e.id : null);
    if (!runId) continue;

    let run = byRun.get(runId);
    if (!run) {
      run = {
        runId,
        workflowName: e.payload?.workflow_name || "",
        startedAt: e.occurred_at,
        status: "running",
        costUsd: 0,
        llmCalls: 0,
        errors: [],
      };
      byRun.set(runId, run);
    }

    // Earliest event = start
    if (new Date(e.occurred_at) < new Date(run.startedAt)) {
      run.startedAt = e.occurred_at;
    }

    if (e.type === "llm_call") {
      run.llmCalls++;
      run.costUsd += e.payload?.cost_usd ?? 0;
    }

    if (e.type.includes("workflow_started") || e.type === "workflow_run_started") {
      run.workflowName = e.payload?.workflow_name || run.workflowName;
      run.startedAt = e.occurred_at;
    }
    if (e.type.includes("workflow_completed") || e.type === "workflow_run_completed") {
      run.status = "completed";
      run.endedAt = e.occurred_at;
    }
    if (e.type.includes("workflow_failed") || e.type.includes("failed")) {
      run.status = "failed";
      run.endedAt = e.occurred_at;
      const err = e.payload?.error || e.payload?.message;
      if (err) run.errors.push(typeof err === "string" ? err : JSON.stringify(err));
    }
  }

  return Array.from(byRun.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

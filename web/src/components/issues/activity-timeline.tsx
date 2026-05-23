"use client";
import { motion } from "framer-motion";
import type { AgentEvent } from "@/lib/api-client";
import { formatRelativeTime, cn } from "@/lib/utils";

interface EventGroup {
  date: string;
  events: AgentEvent[];
}

export function ActivityTimeline({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return (
      <div className="text-center py-12 t-small" style={{ color: "var(--text-tertiary)" }}>
        No activity yet. Trigger a workflow to start.
      </div>
    );
  }

  const groups = groupByDay(events);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-3 mb-3 sticky top-0 py-1 z-10" style={{ background: "var(--bg-canvas)" }}>
            <span className="t-overline" style={{ color: "var(--text-tertiary)" }}>{group.date}</span>
            <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="t-tiny tabular-nums" style={{ color: "var(--text-quaternary)" }}>
              {group.events.length}
            </span>
          </div>
          <ul className="relative space-y-px pl-6">
            <span
              className="absolute left-[11px] top-1 bottom-1 w-px"
              style={{ background: "var(--border)" }}
            />
            {group.events.map((e, idx) => (
              <ActivityRow key={e.id} event={e} delay={idx * 0.02} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ event, delay }: { event: AgentEvent; delay: number }) {
  const meta = describe(event);
  return (
    <motion.li
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="relative py-2"
    >
      <span
        className="absolute -left-[19px] top-3 w-2 h-2 rounded-full ring-2"
        style={{
          background: meta.color,
          boxShadow: `0 0 0 3px var(--bg-canvas)`,
        }}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {meta.title}
            </span>
            <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {event.type}
            </span>
            {event.actor && (
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                · by {event.actor}
              </span>
            )}
          </div>
          {meta.detail && (
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {meta.detail}
            </p>
          )}
          {meta.cost != null && (
            <p className="text-[11px] mt-0.5 font-mono tabular-nums" style={{ color: "var(--accent)" }}>
              ${meta.cost.toFixed(4)} {meta.tokens && `· ${meta.tokens.toLocaleString()} tokens`}
            </p>
          )}
        </div>
        <span className="t-tiny tabular-nums flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </motion.li>
  );
}

function describe(e: AgentEvent): {
  title: string;
  detail?: string;
  color: string;
  cost?: number;
  tokens?: number;
} {
  const p = e.payload || {};
  if (e.type === "status_change" || e.type.includes("status")) {
    return {
      title: "Status changed",
      detail: p.from && p.to ? `${p.from} → ${p.to}` : undefined,
      color: "var(--status-info)",
    };
  }
  if (e.type === "issue_created") {
    return { title: "Issue created", color: "var(--status-success)" };
  }
  if (e.type === "llm_call") {
    return {
      title: "LLM call",
      detail: p.model || p.prompt_id,
      cost: p.cost_usd,
      tokens: p.tokens_total ?? p.tokens_in ? (p.tokens_in ?? 0) + (p.tokens_out ?? 0) : undefined,
      color: "var(--accent)",
    };
  }
  if (e.type.includes("workflow_started")) {
    return { title: "Workflow started", detail: p.workflow_name, color: "var(--status-info)" };
  }
  if (e.type.includes("workflow_completed")) {
    return { title: "Workflow completed", detail: p.workflow_name, color: "var(--status-success)" };
  }
  if (e.type.includes("workflow_failed") || e.type.includes("failed")) {
    return { title: "Workflow failed", detail: p.error || p.message, color: "var(--status-danger)" };
  }
  if (e.type.includes("decision")) {
    return { title: "Agent decision", detail: p.decision || p.choice, color: "var(--status-purple)" };
  }
  if (e.type.includes("scope")) {
    return { title: "Scope lease", detail: p.paths?.join(", "), color: "var(--status-warning)" };
  }
  if (e.type.includes("comment")) {
    return { title: "Comment added", detail: p.body?.slice(0, 100), color: "var(--text-tertiary)" };
  }
  return {
    title: e.type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    detail: typeof p.message === "string" ? p.message : undefined,
    color: "var(--text-tertiary)",
  };
}

function groupByDay(events: AgentEvent[]): EventGroup[] {
  const groups: Record<string, AgentEvent[]> = {};
  const sorted = [...events].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  for (const e of sorted) {
    const key = dayLabel(new Date(e.occurred_at));
    (groups[key] ||= []).push(e);
  }
  return Object.entries(groups).map(([date, events]) => ({ date, events }));
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

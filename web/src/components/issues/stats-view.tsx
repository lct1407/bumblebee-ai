"use client";
import { motion } from "framer-motion";
import type { Issue } from "@/lib/api-client";

export function StatsView({ issues }: { issues: Issue[] }) {
  const byStatus = groupBy(issues, "status");
  const byPriority = groupBy(issues, "priority");
  const byType = groupBy(issues, "type");
  const byComplexity = groupBy(issues, (i) => i.complexity || "unknown");

  const total = issues.length;
  const closed = (byStatus["closed"] ?? []).length;
  const active = (byStatus["in_progress"] ?? []).length + (byStatus["in_review"] ?? []).length;
  const completion = total > 0 ? (closed / total) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigStat label="Total" value={total} />
        <BigStat label="Completion" value={`${completion.toFixed(0)}%`} accent />
        <BigStat label="Active" value={active} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Donut title="By status" groups={byStatus} colorize={statusColor} />
        <Donut title="By priority" groups={byPriority} colorize={priorityColor} />
        <Donut title="By type" groups={byType} colorize={typeColor} />
        <Donut title="By complexity" groups={byComplexity} colorize={complexityColor} />
      </div>
    </div>
  );
}

function BigStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="t-overline" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div
        className="text-4xl font-semibold mt-1.5 tabular-nums tracking-tight"
        style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}
      >
        {value}
      </div>
    </motion.div>
  );
}

function Donut({
  title,
  groups,
  colorize,
}: {
  title: string;
  groups: Record<string, any[]>;
  colorize: (k: string) => string;
}) {
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const total = entries.reduce((s, [, v]) => s + v.length, 0);
  let offset = 0;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <h3 className="t-overline mb-4" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90 flex-shrink-0">
          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="var(--border)" strokeWidth="3" />
          {entries.map(([k, v]) => {
            const pct = total > 0 ? (v.length / total) * 100 : 0;
            const dasharray = `${pct} ${100 - pct}`;
            const dashoffset = -offset;
            offset += pct;
            return (
              <motion.circle
                key={k}
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke={colorize(k)}
                strokeWidth="3"
                strokeDasharray={dasharray}
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: dashoffset }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                pathLength="100"
              />
            );
          })}
        </svg>
        <ul className="flex-1 space-y-1.5 t-small">
          {entries.map(([k, v]) => {
            const pct = total > 0 ? (v.length / total) * 100 : 0;
            return (
              <li key={k} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorize(k) }} />
                <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{k}</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  {v.length} <span style={{ opacity: 0.6 }}>· {pct.toFixed(0)}%</span>
                </span>
              </li>
            );
          })}
          {entries.length === 0 && <li style={{ color: "var(--text-tertiary)" }} className="italic">No data</li>}
        </ul>
      </div>
    </motion.div>
  );
}

function groupBy<T>(arr: T[], key: keyof T | ((t: T) => string)): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = typeof key === "function" ? key(item) : (item[key] as unknown as string) || "unknown";
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

/* Status hues use CSS chart tokens for theme parity */
function statusColor(s: string) {
  const map: Record<string, string> = {
    new: "var(--chart-2)",
    triaged: "var(--chart-4)",
    planned: "var(--chart-6)",
    approved: "var(--chart-3)",
    in_progress: "var(--chart-1)",
    in_review: "var(--chart-4)",
    closed: "var(--chart-3)",
    failed: "var(--chart-5)",
    wont_fix: "var(--status-neutral)",
  };
  return map[s] || "var(--status-neutral)";
}
function priorityColor(s: string) {
  const map: Record<string, string> = {
    critical: "var(--chart-5)",
    high: "var(--chart-1)",
    medium: "var(--chart-2)",
    low: "var(--status-neutral)",
    none: "var(--status-neutral)",
  };
  return map[s] || "var(--status-neutral)";
}
function typeColor(s: string) {
  const map: Record<string, string> = {
    bug: "var(--chart-5)",
    feature: "var(--chart-4)",
    task: "var(--chart-2)",
    story: "var(--chart-3)",
    epic: "var(--chart-1)",
    chore: "var(--status-neutral)",
    spike: "var(--chart-6)",
  };
  return map[s] || "var(--status-neutral)";
}
function complexityColor(s: string) {
  const map: Record<string, string> = {
    Simple: "var(--chart-3)",
    Medium: "var(--chart-1)",
    Complex: "var(--chart-5)",
    unknown: "var(--status-neutral)",
  };
  return map[s] || "var(--status-neutral)";
}

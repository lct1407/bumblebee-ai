"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Issue, AgentEvent } from "@/lib/api-client";
import { useTheme } from "@/components/theme/theme-provider";

/** Resolved chart colors from CSS variables — re-reads when theme changes. */
function useChartColors() {
  const { resolved } = useTheme();
  const [c, setC] = useState({
    accent: "#d97706",
    accentSoft: "rgba(217,119,6,0.08)",
    purple: "#7c3aed",
    series: ["#d97706", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0891b2"],
    grid: "#e4e4e7",
    axis: "#71717a",
    tooltipBg: "#ffffff",
    tooltipBorder: "#d4d4d8",
    text: "#18181b",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    setC({
      accent: v("--chart-1") || "#d97706",
      accentSoft: resolved === "dark" ? "rgba(251,191,36,0.18)" : "rgba(217,119,6,0.10)",
      purple: v("--chart-4") || "#7c3aed",
      series: [v("--chart-1"), v("--chart-2"), v("--chart-3"), v("--chart-4"), v("--chart-5"), v("--chart-6")],
      grid: v("--chart-grid"),
      axis: v("--chart-axis"),
      tooltipBg: v("--chart-tooltip-bg"),
      tooltipBorder: v("--chart-tooltip-border"),
      text: v("--text-primary"),
    });
  }, [resolved]);
  return c;
}

const STATUS_KEY_TO_CHART: Record<string, number> = {
  new: 1, triaged: 3, planned: 5, approved: 2, in_progress: 0,
  in_review: 3, closed: 2, failed: 4, wont_fix: -1,
};

function Card({ title, hint, value, children }: { title: string; hint?: string; value?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="t-overline" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
          {hint && <p className="t-small mt-0.5" style={{ color: "var(--text-quaternary)" }}>{hint}</p>}
        </div>
        {value && (
          <span className="text-xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {value}
          </span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

function tooltipStyle(c: ReturnType<typeof useChartColors>) {
  return {
    backgroundColor: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: c.text,
    boxShadow: "var(--shadow-md)",
  };
}

export function ThroughputChart({ events }: { events: AgentEvent[] }) {
  const c = useChartColors();
  const buckets = bucketByHour(events, 24);
  return (
    <Card title="Workflow throughput" hint="Events / hour, last 24h" value={events.length}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke={c.grid} />
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle(c)} cursor={{ fill: c.accentSoft }} />
          <Area type="monotone" dataKey="count" stroke={c.accent} strokeWidth={2} fill="url(#throughputFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function CostSparkline({ events }: { events: AgentEvent[] }) {
  const c = useChartColors();
  const llmEvents = events.filter((e) => e.type === "llm_call");
  const buckets = bucketByHour(llmEvents, 24, (e) => e.payload?.cost_usd ?? 0);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  return (
    <Card title="LLM cost" hint="USD / hour, last 24h" value={`$${total.toFixed(3)}`}>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={c.grid} />
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle(c)} formatter={(v: any) => [`$${Number(v ?? 0).toFixed(4)}`, "Cost"]} />
          <Line type="monotone" dataKey="count" stroke={c.purple} strokeWidth={2} dot={{ r: 2.5, fill: c.purple, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function StatusPie({ issues }: { issues: Issue[] }) {
  const c = useChartColors();
  const counts = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const colorFor = (name: string) => {
    const idx = STATUS_KEY_TO_CHART[name];
    return idx >= 0 ? c.series[idx] : c.axis;
  };

  return (
    <Card title="Status mix" hint={`${issues.length} issues total`}>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="50%" height={160}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={36} outerRadius={64} paddingAngle={2} dataKey="value" animationDuration={600}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={colorFor(entry.name)} stroke="none" />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle(c)} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex-1 space-y-1 t-small">
          {data.sort((a, b) => b.value - a.value).map((d) => {
            const pct = ((d.value / issues.length) * 100).toFixed(0);
            return (
              <li key={d.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorFor(d.name) }} />
                <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{d.name}</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>{d.value} · {pct}%</span>
              </li>
            );
          })}
          {data.length === 0 && <li style={{ color: "var(--text-tertiary)" }} className="italic">No issues yet</li>}
        </ul>
      </div>
    </Card>
  );
}

export function ActivityFeed({ events }: { events: AgentEvent[] }) {
  return (
    <Card title="Recent activity" hint={`Last ${events.length} events`}>
      <div className="absolute right-5 top-5">
        <span className="flex items-center gap-1.5 t-tiny font-medium" style={{ color: "var(--status-success)" }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "var(--status-success)" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--status-success)" }} />
          </span>
          Live
        </span>
      </div>
      <div className="space-y-px max-h-80 overflow-y-auto -mx-1.5 pr-1">
        {events.length === 0 && (
          <p className="t-small py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No recent activity</p>
        )}
        {events.map((e, idx) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.015 }}
            className="flex items-start gap-3 py-1.5 px-1.5 rounded-md transition hover:bg-[var(--bg-subtle)]"
          >
            <div
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px]"
              style={{
                background: bgForEvent(e.type),
                color: fgForEvent(e.type),
              }}
            >
              {iconFor(e.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono t-tiny truncate" style={{ color: "var(--text-secondary)" }}>{e.type}</span>
                <span className="t-tiny tabular-nums flex-shrink-0" style={{ color: "var(--text-quaternary)" }}>
                  {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="t-tiny mt-0.5 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                {e.actor && <span>by {e.actor}</span>}
                {e.payload?.cost_usd != null && (
                  <span className="font-mono" style={{ color: "var(--accent)" }}>
                    ${e.payload.cost_usd.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

function bgForEvent(type: string) {
  if (type.includes("completed")) return "var(--status-success-bg)";
  if (type.includes("failed")) return "var(--status-danger-bg)";
  if (type.includes("llm_call")) return "var(--status-warning-bg)";
  if (type.includes("started")) return "var(--status-info-bg)";
  return "var(--bg-subtle)";
}
function fgForEvent(type: string) {
  if (type.includes("completed")) return "var(--status-success)";
  if (type.includes("failed")) return "var(--status-danger)";
  if (type.includes("llm_call")) return "var(--status-warning)";
  if (type.includes("started")) return "var(--status-info)";
  return "var(--text-tertiary)";
}

function bucketByHour(events: AgentEvent[], hours: number, valueFn?: (e: AgentEvent) => number) {
  const now = Date.now();
  const start = now - hours * 3600_000;
  const buckets: { hour: string; count: number }[] = [];
  for (let i = 0; i < hours; i++) {
    const t = start + i * 3600_000;
    const d = new Date(t);
    buckets.push({ hour: `${d.getHours()}:00`, count: 0 });
  }
  for (const e of events) {
    const t = new Date(e.occurred_at).getTime();
    if (t < start || t > now) continue;
    const idx = Math.floor((t - start) / 3600_000);
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].count += valueFn ? valueFn(e) : 1;
    }
  }
  return buckets;
}

function iconFor(type: string): string {
  if (type.includes("completed")) return "✓";
  if (type.includes("failed")) return "✕";
  if (type.includes("llm_call")) return "◆";
  if (type.includes("started")) return "▸";
  if (type.includes("created")) return "+";
  return "·";
}

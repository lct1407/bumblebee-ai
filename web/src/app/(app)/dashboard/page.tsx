"use client";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { IssuesApi, EventsApi } from "@/lib/api-client";
import { useActiveProject } from "@/lib/use-active-project";
import { StatCard } from "@/components/app/stat-card";
import {
  ThroughputChart,
  CostSparkline,
  StatusPie,
  ActivityFeed,
} from "@/components/app/dashboard-widgets";
import { CardSkeleton } from "@/components/ui/skeleton";
import { TypeIcon } from "@/components/ui/type-icon";

export default function Dashboard() {
  const { project, projects } = useActiveProject();
  const issues = useQuery({
    queryKey: ["issues", project],
    queryFn: () => IssuesApi.list(project!),
    enabled: !!project,
  });
  const events = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () => EventsApi.recent(100),
    refetchInterval: 5000,
  });

  const issueList = issues.data ?? [];
  const eventList = events.data ?? [];

  const issueCount = issueList.length;
  const byStatus = issueList.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  const llmEvents = eventList.filter((e) => e.type === "llm_call");
  const totalCost = llmEvents.reduce((sum, e) => sum + (e.payload?.cost_usd ?? 0), 0);
  const completedRuns = eventList.filter((e) => e.type.includes("completed")).length;

  const recentIssues = [...issueList]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="masthead flex items-start justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            Project
            <code className="font-mono mx-1.5 px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
              {project ?? "…"}
            </code>
            · Workflow overview
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/issues?new=1"
            className="px-3 py-1.5 rounded-md text-sm font-medium transition"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            New issue
          </Link>
          <Link
            href="/issues"
            className="px-3 py-1.5 rounded-md text-sm font-medium border transition hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            All issues →
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {issues.isLoading ? (
          <>
            <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Active projects" value={projects.data?.length ?? "—"} hint="workspaces" />
            <StatCard label="Total issues" value={issueCount} hint={`${byStatus["new"] || 0} unprocessed`} />
            <StatCard label="Completed runs" value={completedRuns} hint="last 100 events" />
            <StatCard label="Cost (24h)" value={`$${totalCost.toFixed(3)}`} hint={`${llmEvents.length} LLM calls`} accent />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ThroughputChart events={eventList} />
        <CostSparkline events={eventList} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <StatusPie issues={issueList} />
        </div>
        <div className="lg:col-span-2">
          <ActivityFeed events={eventList.slice(0, 30)} />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border p-5"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="t-overline" style={{ color: "var(--text-tertiary)" }}>Recently updated</h2>
            <p className="t-small mt-0.5" style={{ color: "var(--text-quaternary)" }}>Latest 5 issues in {project ?? "…"}</p>
          </div>
          <Link href="/issues" className="text-xs transition" style={{ color: "var(--accent)" }}>
            See all →
          </Link>
        </div>
        <div className="-mx-2">
          {recentIssues.length === 0 && (
            <p className="py-6 text-center t-small" style={{ color: "var(--text-tertiary)" }}>No issues yet</p>
          )}
          {recentIssues.map((issue) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.number}`}
              className="flex items-center gap-3 py-2 px-2 rounded-md transition hover:bg-[var(--bg-subtle)]"
            >
              <span className="flex-shrink-0" style={{ color: "var(--text-tertiary)" }}><TypeIcon type={issue.type} size={14} /></span>
              <span className="font-mono text-[11px] flex-shrink-0 font-semibold" style={{ color: "var(--accent)" }}>
                {(project ?? "").toUpperCase()}-{issue.number}
              </span>
              <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{issue.title}</span>
              <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{issue.status}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="t-overline mb-3" style={{ color: "var(--text-tertiary)" }}>Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(projects.data ?? []).map((p: any) => (
            <Link
              key={p.id}
              href="/issues"
              className="group rounded-xl border p-4 transition"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>{p.name}</h3>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
                >
                  {p.key}
                </span>
              </div>
              <p className="text-sm mt-1 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
                {p.description || "—"}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <span>Provider <span className="font-mono">{p.default_provider}</span></span>
                <span className="ml-auto transition group-hover:text-[var(--accent)]">→</span>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

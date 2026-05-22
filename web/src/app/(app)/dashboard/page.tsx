"use client";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { IssuesApi, ProjectsApi, EventsApi } from "@/lib/api-client";
import { StatCard } from "@/components/app/stat-card";

export default function Dashboard() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: ProjectsApi.list });
  const issues = useQuery({
    queryKey: ["issues", "bb"],
    queryFn: () => IssuesApi.list("bb"),
  });
  const events = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () => fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/events?limit=20`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const issueCount = issues.data?.length ?? 0;
  const byStatus = issues.data?.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {}) ?? {};

  const llmEvents = (events.data ?? []).filter((e: any) => e.type === "llm_call");
  const totalCost = llmEvents.reduce((sum: number, e: any) => sum + (e.payload?.cost_usd ?? 0), 0);
  const completedRuns = (events.data ?? []).filter((e: any) => e.type === "workflow_completed").length;

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Welcome back. Here's what's happening.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/issues"
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            View issues →
          </Link>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Active projects" value={projects.data?.length ?? "—"} hint="self-hosted workspaces" color="amber" />
        <StatCard label="Total issues" value={issueCount} hint={`${byStatus["new"] || 0} unprocessed`} color="emerald" />
        <StatCard label="Workflows completed" value={completedRuns} hint="last 20 events" color="blue" />
        <StatCard label="Cost today" value={`$${totalCost.toFixed(3)}`} hint={`${llmEvents.length} LLM calls`} color="purple" />
      </div>

      {/* Two-column: status distribution + activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">Status distribution</h2>
          <div className="space-y-3">
            {Object.entries(byStatus).map(([s, n]) => {
              const pct = issueCount > 0 ? ((n / issueCount) * 100) : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{s}</span>
                    <span className="text-zinc-500">{n} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        s === "new" ? "bg-blue-500" :
                        s === "in_progress" ? "bg-amber-500" :
                        s === "closed" ? "bg-emerald-500" :
                        s === "failed" ? "bg-rose-500" : "bg-zinc-400"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
            {issueCount === 0 && (
              <p className="text-sm text-zinc-500">No issues yet. <Link href="/issues" className="text-amber-500 hover:underline">Create one →</Link></p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Recent activity</h2>
            <span className="flex items-center gap-1.5 text-xs text-emerald-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {(events.data ?? []).length === 0 && (
              <p className="text-sm text-zinc-500">No recent activity. <Link href="/issues" className="text-amber-500 hover:underline">Trigger a workflow →</Link></p>
            )}
            {(events.data ?? []).map((e: any, idx: number) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="flex items-start gap-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
              >
                <div className={`flex-shrink-0 mt-1 w-2 h-2 rounded-full ${
                  e.type.includes("completed") ? "bg-emerald-500" :
                  e.type.includes("failed") ? "bg-rose-500" :
                  e.type.includes("llm_call") ? "bg-amber-500" :
                  e.type.includes("started") ? "bg-blue-500" : "bg-zinc-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                      {e.type}
                    </span>
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {new Date(e.occurred_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {e.actor && <div className="text-xs text-zinc-500">by {e.actor}</div>}
                  {e.payload?.cost_usd && (
                    <div className="text-xs text-amber-600 font-mono">cost: ${e.payload.cost_usd.toFixed(4)}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Projects */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projects.data ?? []).map((p: any) => (
            <Link
              key={p.id}
              href="/issues"
              className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-amber-500/40 transition"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-bold text-lg">{p.name}</h3>
                <span className="text-xs font-mono text-zinc-500">{p.slug}</span>
              </div>
              <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{p.description || "—"}</p>
              <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
                <span>Provider: <span className="font-mono">{p.default_provider}</span></span>
                <span className="ml-auto group-hover:text-amber-500 transition">→</span>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

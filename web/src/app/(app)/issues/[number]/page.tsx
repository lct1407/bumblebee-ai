"use client";
import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import { EventsApi, IssuesApi, MilestonesApi, ProjectsApi, WorkflowApi, getActiveProject, type Issue } from "@/lib/api-client";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { IssueForm } from "@/components/issues/issue-form";
import { Comments } from "@/components/issues/comments";
import { PeopleScheduleCard } from "@/components/issues/people-schedule-card";
import { ActivityTimeline } from "@/components/issues/activity-timeline";
import { WorkflowRuns } from "@/components/issues/workflow-runs";
import { AcceptanceChecklist } from "@/components/issues/acceptance-checklist";
import { LiveStream } from "@/components/issues/live-stream";
import { useEventStream } from "@/lib/event-stream";
import { parseDescription, serializeDescription, acceptanceProgress } from "@/lib/issue-sections";
import { TypeIcon } from "@/components/ui/type-icon";
import { formatRelativeTime, cn } from "@/lib/utils";

type Tab = "overview" | "activity" | "runs";

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const num = parseInt(number, 10);
  const qc = useQueryClient();
  const project = typeof window !== "undefined" ? getActiveProject() : "bb";

  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const issue = useQuery({
    queryKey: ["issue", project, num],
    queryFn: () => IssuesApi.get(project, num),
  });

  const events = useQuery({
    queryKey: ["events", issue.data?.id],
    queryFn: () => EventsApi.forIssue(issue.data!.id, 200),
    enabled: !!issue.data?.id,
    refetchInterval: 5000,
  });

  const members = useQuery({
    queryKey: ["project-members", project],
    queryFn: () => ProjectsApi.members(project),
  });

  const milestones = useQuery({
    queryKey: ["milestones", project],
    queryFn: () => MilestonesApi.list(project),
  });

  // Live WebSocket stream (chunks + pushed events)
  const stream = useEventStream({
    project,
    issueId: issue.data?.id,
    enabled: !!issue.data?.id,
  });

  // Merge polled + streamed events, dedupe by id, newest first
  const mergedEvents = (() => {
    const polled = events.data ?? [];
    const seen = new Set(polled.map((e) => e.id));
    // Stream events need to be normalized to AgentEvent shape (source default)
    const extra = stream.events
      .filter((e) => !seen.has(e.id))
      .map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload ?? {},
        source: (e as any).source ?? "system",
        actor: e.actor ?? null,
        occurred_at: e.occurred_at,
      }));
    return [...extra, ...polled].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
  })();

  const update = useMutation({
    mutationFn: (patch: Partial<Issue>) => IssuesApi.update(project, num, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", project, num] });
      qc.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const trigger = useMutation({
    mutationFn: () => WorkflowApi.trigger(issue.data!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  // Approve: GraphQL approveIssue mutation
  const approve = useMutation({
    mutationFn: async () => {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const token = typeof window !== "undefined" ? localStorage.getItem("bumblebee.token") : null;
      const r = await fetch(`${apiBase}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: "mutation($id: UUID!) { approveIssue(id: $id) { number status } }",
          variables: { id: issue.data!.id },
        }),
      });
      const body = await r.json();
      if (body.errors) throw new Error(body.errors[0].message);
      return body.data.approveIssue;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  // Plan: force feature-complex-flow (has 'plan' node = Coordinator/Planner)
  const planMutation = useMutation({
    mutationFn: async () => {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const r = await fetch(`${apiBase}/api/workflow-runs/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_id: issue.data!.id,
          workflow_name: "feature-complex-flow",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (issue.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-1/3 rounded animate-pulse" style={{ background: "var(--bg-subtle)" }} />
        <div className="h-4 w-1/4 rounded animate-pulse" style={{ background: "var(--bg-subtle)" }} />
      </div>
    );
  }
  if (issue.isError || !issue.data) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-tertiary)" }}>
        Issue not found.{" "}
        <Link href="/issues" className="text-[var(--accent)] hover:underline">Back to issues</Link>
      </div>
    );
  }

  const i = issue.data;
  const sections = parseDescription(i.description);
  const acceptance = acceptanceProgress(sections.acceptance);

  const totalCost = mergedEvents
    .filter((e) => e.type === "llm_call")
    .reduce((sum, e) => sum + (e.payload?.cost_usd ?? 0), 0);
  const totalCalls = mergedEvents.filter((e) => e.type === "llm_call").length;

  const updateAcceptance = (next: string) => {
    const newDescription = serializeDescription({ ...sections, acceptance: next }, i.type);
    update.mutate({ description: newDescription });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/issues"
          className="t-small inline-flex items-center gap-1 transition hover:text-[var(--text-primary)]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All issues
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {project.toUpperCase()}-{i.number}
            </span>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>·</span>
            <span className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              <TypeIcon type={i.type} size={14} />
              {i.type}
            </span>
            {i.complexity && (
              <>
                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>·</span>
                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {i.complexity}
                </span>
              </>
            )}
          </div>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>{i.title}</h1>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <StatusBadge status={i.status} />
            <PriorityBadge priority={i.priority} />
            {i.ai_confidence != null && (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                AI confidence
                <span
                  className="font-mono tabular-nums font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {Math.round(i.ai_confidence * 100)}%
                </span>
              </span>
            )}
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Updated {formatRelativeTime(i.updated_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => setEditOpen(true)}
            className="px-3 py-1.5 rounded-md text-sm font-medium border transition hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Edit
          </button>
          <button
            onClick={() => planMutation.mutate()}
            disabled={planMutation.isPending}
            title="Run Planner (Coordinator role) — picks feature-complex-flow"
            className="px-3 py-1.5 rounded-md text-sm font-medium border transition hover:bg-[var(--bg-subtle)] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            {planMutation.isPending ? "Planning…" : "🧠 Plan"}
          </button>
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || i.status === "approved"}
            title="Approve issue → unblock workflow dispatch"
            className="px-3 py-1.5 rounded-md text-sm font-medium border transition hover:bg-[var(--bg-subtle)] disabled:opacity-50"
            style={{
              borderColor: i.status === "approved" ? "var(--success, #10b981)" : "var(--border)",
              color: i.status === "approved" ? "var(--success, #10b981)" : "var(--text-secondary)",
            }}
          >
            {approve.isPending ? "Approving…" : i.status === "approved" ? "✓ Approved" : "✅ Approve"}
          </button>
          <button
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
            title="Trigger workflow (H1 router picks based on complexity)"
            className="px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {trigger.isPending ? "Triggering…" : "▶ Trigger workflow"}
          </button>
        </div>
      </header>

      {(planMutation.isError || approve.isError || trigger.isError) && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: "var(--bg-subtle)",
            borderColor: "var(--danger, #ef4444)",
            color: "var(--danger, #ef4444)",
          }}
        >
          {(planMutation.error || approve.error || trigger.error)?.message}
        </div>
      )}

      {(planMutation.isSuccess || approve.isSuccess || trigger.isSuccess) && (
        <div
          className="rounded-md border p-3 text-sm flex items-center gap-2"
          style={{ borderColor: "var(--success, #10b981)" }}
        >
          <span>✓ Action submitted. Provider:</span>
          <code
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: "var(--bg-subtle)" }}
          >
            {process.env.NEXT_PUBLIC_LLM_PROVIDER || "stub"}
          </code>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            (stub = canned response · claude-cli = real Claude · gemini = Vertex AI)
          </span>
        </div>
      )}

      <nav className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-6 -mb-px">
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
            Overview
          </TabBtn>
          <TabBtn active={tab === "activity"} onClick={() => setTab("activity")}>
            Activity
            <span className="ml-1.5 t-tiny tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {mergedEvents.length}
            </span>
            {Object.values(stream.sessions).some((s) => s.status === "streaming") && (
              <span
                className="ml-1.5 w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--accent)" }}
                title="Live"
              />
            )}
          </TabBtn>
          <TabBtn active={tab === "runs"} onClick={() => setTab("runs")}>
            Runs
          </TabBtn>
        </div>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {tab === "overview" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <Section title="Overview">
                <Body text={sections.overview} placeholder="No overview yet." />
              </Section>

              {sections.acceptance && (
                <Section
                  title="Acceptance criteria"
                  badge={acceptance ? `${acceptance.done}/${acceptance.total}` : undefined}
                >
                  <AcceptanceChecklist text={sections.acceptance} onChange={updateAcceptance} />
                </Section>
              )}

              {i.type === "bug" && (
                <>
                  {sections.reproduction && (
                    <Section title="Reproduction steps">
                      <Body text={sections.reproduction} mono />
                    </Section>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sections.expected && (
                      <Section title="Expected">
                        <Body text={sections.expected} />
                      </Section>
                    )}
                    {sections.actual && (
                      <Section title="Actual">
                        <Body text={sections.actual} />
                      </Section>
                    )}
                  </div>
                  {sections.environment && (
                    <Section title="Environment">
                      <Body text={sections.environment} mono />
                    </Section>
                  )}
                  {sections.root_cause && (
                    <Section title="Root cause" accent>
                      <Body text={sections.root_cause} />
                    </Section>
                  )}
                </>
              )}

              {i.ai_summary && (
                <Section title="AI summary" accent>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                    {i.ai_summary}
                  </p>
                </Section>
              )}

              <Comments project={project} number={num} />
            </motion.div>
          )}

          {tab === "activity" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <LiveStream sessions={stream.sessions} status={stream.status} />
              <ActivityTimeline events={mergedEvents} />
            </motion.div>
          )}

          {tab === "runs" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <WorkflowRuns events={mergedEvents} />
            </motion.div>
          )}
        </div>

        {/* Metadata sidebar */}
        <aside className="space-y-4">
          <PeopleScheduleCard
            issue={i}
            members={members.data ?? []}
            milestones={milestones.data ?? []}
            saving={update.isPending}
            onUpdate={(patch) => update.mutate(patch)}
          />

          <MetadataCard>
            <MetaRow label="Status"><StatusBadge status={i.status} /></MetaRow>
            <MetaRow label="Priority"><PriorityBadge priority={i.priority} /></MetaRow>
            <MetaRow label="Type">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{i.type}</span>
            </MetaRow>
            {i.complexity && (
              <MetaRow label="Complexity">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{i.complexity}</span>
              </MetaRow>
            )}
            <MetaRow label="Created">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {formatRelativeTime(i.created_at)}
              </span>
            </MetaRow>
            <MetaRow label="Updated">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {formatRelativeTime(i.updated_at)}
              </span>
            </MetaRow>
          </MetadataCard>

          {(events.data?.length ?? 0) > 0 && (
            <MetadataCard title="Workflow stats">
              <MetaRow label="LLM calls">
                <span className="text-sm font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {totalCalls}
                </span>
              </MetaRow>
              <MetaRow label="Total cost">
                <span className="text-sm font-mono tabular-nums" style={{ color: "var(--accent)" }}>
                  ${totalCost.toFixed(4)}
                </span>
              </MetaRow>
              <MetaRow label="Events">
                <span className="text-sm font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {events.data?.length ?? 0}
                </span>
              </MetaRow>
            </MetadataCard>
          )}

          {(i.scope_hints?.length ?? 0) > 0 && (
            <MetadataCard title="Scope hints">
              <div className="flex flex-wrap gap-1.5">
                {i.scope_hints.map((s) => (
                  <code
                    key={s}
                    className="px-1.5 py-0.5 rounded text-[11px] font-mono"
                    style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                  >
                    {s}
                  </code>
                ))}
              </div>
            </MetadataCard>
          )}
        </aside>
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={`Edit ${project.toUpperCase()}-${i.number}`}>
        <IssueForm
          mode="edit"
          initial={i}
          submitting={update.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(payload) => {
            update.mutate(payload as any, {
              onSuccess: () => setEditOpen(false),
            });
          }}
        />
      </Sheet>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="relative pb-2.5 text-sm font-medium transition inline-flex items-baseline"
      style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}
    >
      {children}
      {active && (
        <motion.span
          layoutId="issue-tab-active"
          className="absolute -bottom-px left-0 right-0 h-[2px]"
          style={{ background: "var(--accent)" }}
        />
      )}
    </button>
  );
}

function Section({
  title,
  badge,
  accent = false,
  children,
}: {
  title: string;
  badge?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("rounded-xl border p-5 relative", accent && "pl-6")}
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {accent && (
        <span
          className="absolute left-0 top-5 bottom-5 w-[2px] rounded-r"
          style={{ background: "var(--accent)" }}
        />
      )}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="t-overline" style={{ color: "var(--text-tertiary)" }}>{title}</h2>
        {badge && (
          <span
            className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Body({ text, placeholder, mono = false }: { text: string; placeholder?: string; mono?: boolean }) {
  if (!text) {
    return (
      <p className="t-small italic" style={{ color: "var(--text-tertiary)" }}>
        {placeholder || "—"}
      </p>
    );
  }
  return (
    <pre
      className={cn(
        "text-sm whitespace-pre-wrap leading-relaxed",
        mono ? "font-mono text-[13px]" : "font-sans",
      )}
      style={{ color: "var(--text-primary)" }}
    >
      {text}
    </pre>
  );
}

function MetadataCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {title && (
        <h3 className="t-overline mb-3" style={{ color: "var(--text-tertiary)" }}>{title}</h3>
      )}
      <dl className="space-y-2.5">{children}</dl>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</dt>
      <dd className="flex-shrink-0">{children}</dd>
    </div>
  );
}

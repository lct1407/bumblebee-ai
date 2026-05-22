"use client";
import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { EventsApi, IssuesApi, WorkflowApi, type AgentEvent } from "@/lib/api-client";

export default function IssueDetail({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const num = parseInt(number, 10);
  const qc = useQueryClient();

  const issue = useQuery({
    queryKey: ["issue", "bb", num],
    queryFn: () => IssuesApi.get("bb", num),
  });

  const events = useQuery({
    queryKey: ["events", issue.data?.id],
    queryFn: () => EventsApi.forIssue(issue.data!.id, 100),
    enabled: !!issue.data?.id,
    refetchInterval: 3000,
  });

  const trigger = useMutation({
    mutationFn: () => WorkflowApi.trigger(issue.data!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (issue.isLoading) return <p className="text-zinc-500">loading…</p>;
  if (issue.isError || !issue.data) return <p className="text-red-600">Issue not found</p>;

  const i = issue.data;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/issues" className="text-sm text-zinc-500 hover:underline">
        ← Back to issues
      </Link>

      <div>
        <h1 className="text-3xl font-bold">
          <span className="font-mono text-amber-600">BB-{i.number}</span>{" "}
          {i.title}
        </h1>
        <div className="mt-2 flex gap-4 text-sm text-zinc-500">
          <span>status: <strong>{i.status}</strong></span>
          <span>priority: <strong>{i.priority}</strong></span>
          <span>type: <strong>{i.type}</strong></span>
          {i.complexity && <span>complexity: <strong>{i.complexity}</strong></span>}
          {i.ai_confidence != null && (
            <span>confidence: <strong>{(i.ai_confidence * 100).toFixed(0)}%</strong></span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          className="rounded bg-amber-500 text-white px-4 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          {trigger.isPending ? "Triggering…" : "▶ Trigger Workflow"}
        </button>
      </div>

      {i.description && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Description</h2>
          <p className="whitespace-pre-wrap">{i.description}</p>
        </section>
      )}

      {i.ai_summary && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-2">
            AI Summary
          </h2>
          <p className="whitespace-pre-wrap text-sm">{i.ai_summary}</p>
        </section>
      )}

      {i.scope_hints?.length > 0 && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Scope Hints</h2>
          <div className="flex gap-2 flex-wrap">
            {i.scope_hints.map((s) => (
              <code key={s} className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">{s}</code>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-3">Event Stream {events.data && `(${events.data.length})`}</h2>
        {events.isLoading && <p className="text-zinc-500">loading…</p>}
        {events.data && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-100 dark:bg-zinc-900 text-left">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e: AgentEvent) => (
                  <tr key={e.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-mono text-zinc-500">
                      {new Date(e.occurred_at).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-amber-600">{e.type}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{e.actor || "—"}</td>
                    <td className="px-3 py-2 max-w-md truncate font-mono text-zinc-500">
                      {JSON.stringify(e.payload).slice(0, 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

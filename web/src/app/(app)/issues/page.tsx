"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { IssuesApi } from "@/lib/api-client";

const STATUS_OPTIONS = ["", "new", "triaged", "in_progress", "in_review", "closed", "failed"];

export default function IssuesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["issues", "bb", statusFilter],
    queryFn: () => IssuesApi.list("bb", statusFilter || undefined),
  });

  const create = useMutation({
    mutationFn: (title: string) => IssuesApi.create("bb", { title, type: "task", priority: "medium" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      setNewTitle("");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Issues</h1>
        <span className="text-sm text-zinc-500">{data?.length ?? 0} total</span>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <label className="text-sm">
          Status:
          <select
            className="ml-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "all"}</option>
            ))}
          </select>
        </label>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) create.mutate(newTitle.trim());
          }}
        >
          <input
            type="text"
            placeholder="New issue title…"
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm w-64"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || create.isPending}
            className="rounded bg-amber-500 text-white px-3 py-1 text-sm font-medium disabled:opacity-50 hover:bg-amber-600"
          >
            {create.isPending ? "..." : "Create"}
          </button>
        </form>
      </div>

      {isLoading && <p className="text-zinc-500">loading…</p>}
      {isError && (
        <p className="text-red-600 text-sm">API unreachable. Check server.</p>
      )}

      {data && (
        <table className="w-full text-sm rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <thead className="bg-zinc-100 dark:bg-zinc-900 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Key</th>
              <th className="px-3 py-2 font-semibold">Title</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Priority</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Complexity</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-950">
            {data.map((issue) => (
              <tr key={issue.id} className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="px-3 py-2 font-mono">
                  <Link href={`/issues/${issue.number}`} className="text-amber-600 hover:underline">
                    BB-{issue.number}
                  </Link>
                </td>
                <td className="px-3 py-2">{issue.title}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={issue.status} />
                </td>
                <td className="px-3 py-2">{issue.priority}</td>
                <td className="px-3 py-2">{issue.type}</td>
                <td className="px-3 py-2">{issue.complexity || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    triaged: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    in_review: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    closed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-zinc-200 dark:bg-zinc-800"}`}>
      {status}
    </span>
  );
}

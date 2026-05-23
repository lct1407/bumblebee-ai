"use client";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PluginsApi } from "@/lib/api-client";
import { TableSkeleton, EmptyState } from "@/components/ui/skeleton";
import { formatRelativeTime, cn } from "@/lib/utils";

export default function PluginsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["plugins"],
    queryFn: PluginsApi.list,
  });

  const reload = useMutation({
    mutationFn: PluginsApi.reload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plugins"] }),
  });

  const plugins = data ?? [];
  const loaded = plugins.filter((p: any) => p.status === "loaded").length;
  const errored = plugins.filter((p: any) => p.status !== "loaded").length;

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Plugins</h1>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            Python entry_points · {plugins.length} installed · {loaded} loaded · {errored} failed
          </p>
        </div>
        <button
          onClick={() => reload.mutate()}
          disabled={reload.isPending}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <svg
            className={cn("w-3.5 h-3.5", reload.isPending && "animate-spin")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {reload.isPending ? "Reloading" : "Reload"}
        </button>
      </motion.div>

      {isLoading && (
        <div className="rounded-xl border p-6" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <TableSkeleton rows={5} />
        </div>
      )}

      {isError && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: "var(--status-danger-bg)", borderColor: "var(--status-danger-border)", color: "var(--status-danger)" }}
        >
          <strong>API unreachable.</strong> Make sure the bumblebee server is running.
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-xl border border-dashed" style={{ borderColor: "var(--border-strong)" }}>
          <EmptyState
            title="No plugins installed"
            description="Bumblebee discovers plugins via Python entry_points. Install a plugin package and click Reload."
            action={
              <code
                className="px-3 py-2 rounded-md text-sm font-mono"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              >
                pip install bumblebee-plugin-example
              </code>
            }
          />
        </div>
      )}

      {data && data.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border overflow-hidden"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
              <tr>
                {["Plugin", "Version", "Module", "Status", "Loaded"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((p: any, idx: number) => (
                <motion.tr
                  key={p.name}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="border-b transition hover:bg-[var(--bg-subtle)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{p.version || "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{p.module || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: p.status === "loaded" ? "var(--status-success)" : "var(--status-danger)" }}
                      />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {p.loaded_at ? formatRelativeTime(p.loaded_at) : "—"}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PluginsApi } from "@/lib/api-client";

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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-baseline">
        <h1 className="text-3xl font-bold">Plugins</h1>
        <button
          onClick={() => reload.mutate()}
          disabled={reload.isPending}
          className="rounded bg-zinc-200 dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          {reload.isPending ? "Reloading…" : "🔄 Reload"}
        </button>
      </div>

      {isLoading && <p className="text-zinc-500">loading…</p>}
      {isError && <p className="text-red-600 text-sm">API unreachable.</p>}

      {data && data.length === 0 && (
        <p className="text-zinc-500">No plugins installed. Install via <code className="px-1 bg-zinc-200 dark:bg-zinc-800 rounded">pip install bumblebee-plugin-name</code> then reload.</p>
      )}

      {data && data.length > 0 && (
        <table className="w-full text-sm rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <thead className="bg-zinc-100 dark:bg-zinc-900 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Loaded At</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-950">
            {data.map((p: any) => (
              <tr key={p.name} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-mono">{p.name}</td>
                <td className="px-3 py-2">{p.version || "—"}</td>
                <td className="px-3 py-2 text-zinc-500 font-mono text-xs">{p.module || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      p.status === "loaded"
                        ? "px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {p.loaded_at ? new Date(p.loaded_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

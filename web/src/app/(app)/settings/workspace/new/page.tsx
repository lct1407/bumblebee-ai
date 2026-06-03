"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WorkspacesApi, setActiveWorkspace } from "@/lib/api-client";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border-strong)",
  color: "var(--text-primary)",
  borderRadius: "5px",
};

export default function NewWorkspacePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => WorkspacesApi.create(name.trim()),
    onSuccess: (ws) => {
      setActiveWorkspace(ws.slug);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/dashboard");
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Could not create workspace"),
  });

  return (
    <div className="max-w-xl">
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Link href="/settings/workspace" className="t-small inline-flex items-center gap-1 mb-3 transition hover:text-[var(--text-primary)]" style={{ color: "var(--text-tertiary)" }}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Settings
        </Link>
        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>New workspace</h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          A workspace is an isolated tenant — its own projects, issues, members and billing. You become the owner.
        </p>
      </motion.header>

      <section className="rounded-xl border p-5 space-y-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); setError(null); if (name.trim()) create.mutate(); }}
        >
          <div>
            <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Workspace name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full px-3 py-2.5 text-sm border outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
            <p className="t-tiny mt-1.5" style={{ color: "var(--text-quaternary)" }}>
              A URL slug is generated automatically from the name.
            </p>
          </div>

          {error && (
            <div className="rounded-[5px] border p-2.5 text-xs" style={{ background: "var(--status-danger-bg)", borderColor: "var(--status-danger-border)", color: "var(--status-danger)" }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="px-4 py-2 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {create.isPending ? "Creating…" : "Create workspace"}
            </button>
            <Link
              href="/settings/workspace"
              className="px-4 py-2 rounded-[5px] text-sm font-medium border transition hover:bg-[var(--bg-subtle)]"
              style={{ borderColor: "var(--border-strong)", color: "var(--text-secondary)" }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

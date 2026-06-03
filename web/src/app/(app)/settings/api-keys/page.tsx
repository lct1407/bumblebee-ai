"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiKeysApi, type ApiKey } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border-strong)",
  color: "var(--text-primary)",
  borderRadius: "5px",
};

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const list = useQuery({ queryKey: ["api-keys"], queryFn: ApiKeysApi.list });

  const create = useMutation({
    mutationFn: () => ApiKeysApi.create(name.trim()),
    onSuccess: (key) => {
      setCreated(key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const keys = list.data ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>API keys</h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          Personal keys for the CLI, MCP server, and CI. Treat them like passwords.
        </p>
      </motion.header>

      {/* Create */}
      <section className="rounded-xl border p-5 space-y-3" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>Create a key</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ci-deploy, laptop-cli"
            className="flex-1 px-3 py-2 text-sm border outline-none focus:border-[var(--accent)]"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="px-4 py-2 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {create.isPending ? "Creating…" : "Create key"}
          </button>
        </form>

        {created?.key && (
          <div
            className="rounded-[5px] border p-3 text-sm"
            style={{ background: "var(--accent-subtle)", borderColor: "var(--accent-border)" }}
          >
            <div className="t-overline mb-1.5" style={{ color: "var(--accent)" }}>
              Copy now — shown once
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[12px] break-all" style={{ color: "var(--text-primary)" }}>
                {created.key}
              </code>
              <button
                onClick={() => { navigator.clipboard?.writeText(created.key!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="px-2.5 py-1 rounded text-xs font-medium flex-shrink-0"
                style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* List */}
      <section className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <h2 className="t-h2 mb-3" style={{ color: "var(--text-primary)" }}>Your keys</h2>
        {list.isLoading ? (
          <div className="h-12 rounded animate-pulse" style={{ background: "var(--bg-subtle)" }} />
        ) : keys.length === 0 ? (
          <p className="t-small" style={{ color: "var(--text-tertiary)" }}>No API keys yet.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 py-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{k.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-quaternary)" }}>
                    Created {formatRelativeTime(k.created_at)}
                  </div>
                </div>
                <code className="font-mono text-[12px]" style={{ color: "var(--text-tertiary)" }}>bb_••••••••</code>
                <span
                  className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded"
                  style={{
                    background: k.is_active ? "var(--status-success-bg)" : "var(--bg-subtle)",
                    color: k.is_active ? "var(--status-success)" : "var(--text-tertiary)",
                  }}
                >
                  {k.is_active ? "active" : "revoked"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

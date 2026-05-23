"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WorkspacesApi,
  getActiveWorkspace,
  setActiveWorkspace,
  type Workspace,
} from "@/lib/api-client";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

export default function WorkspaceSettingsPage() {
  const qc = useQueryClient();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  useEffect(() => setActiveSlug(getActiveWorkspace()), []);

  const all = useQuery({ queryKey: ["workspaces"], queryFn: WorkspacesApi.listMine });
  const current: Workspace | undefined = (all.data ?? []).find((w) => w.slug === activeSlug);

  const [name, setName] = useState("");
  useEffect(() => {
    if (current) setName(current.name);
  }, [current?.id]);

  const update = useMutation({
    mutationFn: (newName: string) =>
      WorkspacesApi.update(current!.id, { name: newName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  const remove = useMutation({
    mutationFn: () => WorkspacesApi.remove(current!.id),
    onSuccess: () => {
      // Pick another workspace + reload
      const others = (all.data ?? []).filter((w) => w.id !== current!.id);
      if (others.length > 0) setActiveWorkspace(others[0].slug);
      window.location.href = "/dashboard";
    },
  });

  const [confirmText, setConfirmText] = useState("");
  const isOwner = current?.role === "owner";

  if (!current) {
    return (
      <div className="t-small" style={{ color: "var(--text-tertiary)" }}>
        Pick a workspace from the sidebar switcher.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
          Workspace
        </h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          Manage the active workspace. Your role:{" "}
          <strong style={{ color: "var(--text-primary)" }}>{current.role}</strong>
        </p>
      </motion.header>

      <section
        className="rounded-xl border p-5 space-y-4"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>General</h2>
        <div>
          <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner && current.role !== "admin"}
            className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Slug (immutable)
          </label>
          <code
            className="block px-3 py-2 rounded-md text-sm font-mono"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
          >
            {current.slug}
          </code>
        </div>
        <div>
          <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Plan
          </label>
          <span
            className="inline-block px-2.5 py-1 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-subtle)", color: "var(--text-primary)" }}
          >
            {current.plan}
          </span>
        </div>
        <div className="pt-2">
          <button
            onClick={() => update.mutate(name)}
            disabled={!isOwner && current.role !== "admin" || name === current.name || update.isPending}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      {isOwner && (
        <section
          className="rounded-xl border p-5 space-y-3 relative"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--status-danger-border)",
          }}
        >
          <span
            className="absolute left-0 top-5 bottom-5 w-[2px] rounded-r"
            style={{ background: "var(--status-danger)" }}
          />
          <h2 className="t-h2 pl-2" style={{ color: "var(--status-danger)" }}>
            Danger zone
          </h2>
          <p className="t-small pl-2" style={{ color: "var(--text-tertiary)" }}>
            Deleting the workspace soft-deletes it. After 30 days everything is hard-deleted, including all projects, issues, and events. Type the slug to confirm.
          </p>
          <div className="pl-2 flex gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={current.slug}
              className="flex-1 px-3 py-2 rounded-md border text-sm font-mono outline-none"
              style={inputStyle}
            />
            <button
              onClick={() => remove.mutate()}
              disabled={confirmText !== current.slug || remove.isPending}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-40"
              style={{
                background: "var(--status-danger)",
                color: "#ffffff",
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete workspace"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

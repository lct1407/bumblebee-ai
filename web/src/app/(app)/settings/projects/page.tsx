"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectsApi, type Project } from "@/lib/api-client";
import { ProjectForm } from "@/components/projects/project-form";
import { useAuth } from "@/lib/use-auth";

export default function ProjectsSettingsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: ProjectsApi.list,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const remove = useMutation({
    mutationFn: (slug: string) => ProjectsApi.remove(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  if (creating) {
    return (
      <div className="space-y-5 max-w-2xl">
        <header>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>New project</h1>
        </header>
        <section
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <ProjectForm onDone={() => setCreating(false)} />
        </section>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-5 max-w-2xl">
        <header>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
            Edit — {editing.name}
          </h1>
          <p className="t-small mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>
            {editing.slug}
          </p>
        </header>
        <section
          className="rounded-xl border p-5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <ProjectForm project={editing} onDone={() => setEditing(null)} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Projects</h1>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            {projects.data?.length ?? 0} project
            {(projects.data?.length ?? 0) === 1 ? "" : "s"} in this workspace
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            New project
          </button>
        )}
      </motion.header>

      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead
            className="border-b"
            style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
          >
            <tr>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>
                Project
              </th>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>
                Key
              </th>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>
                Branch
              </th>
              {isAdmin && <th className="w-28" />}
            </tr>
          </thead>
          <tbody>
            {(projects.data ?? []).map((p, idx) => (
              <motion.tr
                key={p.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {p.slug}
                  </div>
                  {p.description && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {p.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold"
                    style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                  >
                    {p.key}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {p.base_branch}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete project "${p.name}"? This cannot be undone.`)) {
                            remove.mutate(p.slug);
                          }
                        }}
                        disabled={remove.isPending}
                        className="text-xs hover:underline disabled:opacity-50"
                        style={{ color: "var(--status-danger)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </motion.tr>
            ))}
            {(projects.data ?? []).length === 0 && !projects.isLoading && (
              <tr>
                <td
                  colSpan={isAdmin ? 4 : 3}
                  className="px-4 py-8 text-center t-small"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  No projects yet.{isAdmin ? " Create one above." : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProjectsApi, type Project, type ProjectCreateBody, type ProjectUpdateBody } from "@/lib/api-client";

interface Props {
  project?: Project;
  onDone: () => void;
}

const inputCls =
  "w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60";
const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProjectForm({ project, onDone }: Props) {
  const qc = useQueryClient();
  const isEdit = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [baseBranch, setBaseBranch] = useState(project?.base_branch ?? "main");
  const [repoPath, setRepoPath] = useState(project?.repo_path ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name while untouched
  useEffect(() => {
    if (!slugTouched && !isEdit) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched, isEdit]);

  const create = useMutation({
    mutationFn: (body: ProjectCreateBody) => ProjectsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onDone();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Failed to create project";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    },
  });

  const update = useMutation({
    mutationFn: (body: ProjectUpdateBody) => ProjectsApi.update(project!.slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onDone();
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Failed to update project";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isEdit) {
      update.mutate({ name, description: description || null, repo_path: repoPath || null, base_branch: baseBranch });
    } else {
      create.mutate({
        name,
        slug,
        key: key.toUpperCase(),
        description: description || null,
        repo_path: repoPath || null,
        base_branch: baseBranch,
      });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
          Name *
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="My Project"
        />
      </div>

      {!isEdit && (
        <>
          <div>
            <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
              Slug *
            </label>
            <input
              required
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              className={inputCls}
              style={inputStyle}
              placeholder="my-project"
              pattern="[a-z0-9][a-z0-9\-]*"
            />
          </div>
          <div>
            <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
              Key * (max 10 chars, uppercase)
            </label>
            <input
              required
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().slice(0, 10))}
              className={inputCls}
              style={inputStyle}
              placeholder="PROJ"
              maxLength={10}
            />
          </div>
        </>
      )}

      <div>
        <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
          Description
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="Optional description"
        />
      </div>

      <div>
        <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
          Base branch
        </label>
        <input
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="main"
        />
      </div>

      <div>
        <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
          Repo path (monorepo)
        </label>
        <input
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="packages/my-service"
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--status-danger)" }}>{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition"
          style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

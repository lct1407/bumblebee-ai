"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ProjectsApi, getActiveProject, setActiveProject } from "@/lib/api-client";

/**
 * Resolves the active project for the current workspace:
 *   1. the last-used project (localStorage) if it still exists in the workspace, else
 *   2. the first project in the workspace.
 * The resolved slug is persisted so it survives reloads and is shared across pages.
 *
 * `project` is null until the project list has loaded (queries should gate on it).
 */
export function useActiveProject() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: ProjectsApi.list });
  const [project, setProjectState] = useState<string | null>(null);

  useEffect(() => {
    const list = projects.data;
    if (!list) return;
    // The active-project key is shared across workspaces, so a value carried over
    // from another workspace must be validated against this workspace's projects;
    // if it isn't present here, fall back to the first project.
    const stored = getActiveProject();
    const resolved =
      stored && list.some((p) => p.slug === stored) ? stored : list[0]?.slug ?? null;
    if (resolved && resolved !== stored) setActiveProject(resolved);
    setProjectState(resolved);
  }, [projects.data]);

  const setProject = (slug: string) => {
    setActiveProject(slug);
    setProjectState(slug);
  };

  return { project, projects, setProject };
}

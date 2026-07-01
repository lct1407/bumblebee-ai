"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import {
  WorkspacesApi,
  getActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/api-client";

/**
 * Workspace switcher pinned to the top of the sidebar (above the project switcher).
 * Reflects the JWT `ws` claim's workspace; switching reloads so all queries pick
 * up the new scope.
 */
export function WorkspaceSwitcher() {
  const [active, setActive] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: WorkspacesApi.listMine,
    staleTime: 60_000,
  });

  // Resolve the active workspace: last-used (localStorage) if still accessible,
  // otherwise the first workspace. Persist so it survives reloads.
  useEffect(() => {
    if (!data || data.length === 0) return;
    const stored = getActiveWorkspace();
    const resolved =
      stored && data.some((w) => w.slug === stored) ? stored : data[0].slug;
    if (resolved !== stored) setActiveWorkspace(resolved);
    setActive(resolved);
  }, [data]);

  const options: ComboOption[] = (data ?? []).map((w) => ({
    value: w.slug,
    label: w.name,
    hint: w.role,
  }));

  if (isLoading) {
    return (
      <div
        className="h-8 w-full rounded-md animate-pulse"
        style={{ background: "var(--bg-subtle)" }}
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <button
        className="w-full text-left px-2.5 py-1.5 rounded-md text-xs border border-dashed transition hover:bg-[var(--bg-subtle)]"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-tertiary)" }}
        onClick={() => (window.location.href = "/settings/workspace/new")}
      >
        + Create your workspace
      </button>
    );
  }

  return (
    <Combobox
      options={options}
      value={active || ""}
      onChange={(slug: string) => {
        setActiveWorkspace(slug);
        setActive(slug);
        // Reload so all queries (issues, events, etc.) pick up the new scope
        window.location.reload();
      }}
      placeholder="Workspace…"
      searchPlaceholder="Search workspaces…"
      className="w-full justify-between"
    />
  );
}

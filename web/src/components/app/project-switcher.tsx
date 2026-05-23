"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { ProjectsApi, getActiveProject, setActiveProject } from "@/lib/api-client";

export function ProjectSwitcher() {
  const [active, setActive] = useState("bb");
  useEffect(() => setActive(getActiveProject()), []);

  const { data } = useQuery({ queryKey: ["projects"], queryFn: ProjectsApi.list });

  const options = (data ?? []).map((p) => ({
    value: p.slug,
    label: p.name,
    hint: p.key,
    icon: "📁",
  }));

  return (
    <Combobox
      options={options}
      value={active}
      onChange={(v: string) => {
        setActiveProject(v);
        setActive(v);
        // Reload current page so all queries pick up new project
        window.location.reload();
      }}
      placeholder="Project…"
      searchPlaceholder="Search projects…"
      className="bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 min-w-[200px]"
    />
  );
}

"use client";
import { Combobox } from "@/components/ui/combobox";
import { setActiveProject } from "@/lib/api-client";
import { useActiveProject } from "@/lib/use-active-project";

export function ProjectSwitcher() {
  const { project, projects } = useActiveProject();

  const options = (projects.data ?? []).map((p) => ({
    value: p.slug,
    label: p.name,
    hint: p.key,
    icon: "📁",
  }));

  return (
    <Combobox
      options={options}
      value={project ?? ""}
      onChange={(v: string) => {
        setActiveProject(v);
        // Reload current page so all queries pick up new project
        window.location.reload();
      }}
      placeholder="Project…"
      searchPlaceholder="Search projects…"
      className="bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 min-w-[200px]"
    />
  );
}

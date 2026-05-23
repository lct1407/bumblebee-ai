import { useState } from "react";
import { useParams } from "react-router-dom";
import { PageShell } from "@/components/ui/page-shell";
import { useAppStore } from "@/stores/app-store";
import { invoke } from "@/hooks/use-tauri-ipc";
import { SkillList } from "@/components/settings/skill-list";
import { SkillDetail } from "@/components/settings/skill-detail";
import { SkillInstaller } from "@/components/settings/skill-installer";
import type { AppConfig, SkillLibraryEntry } from "@/lib/types";

export function SkillsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { config, setConfig } = useAppStore();
  const projectConfig = slug ? config.projects[slug] : undefined;

  const [installing, setInstalling] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const skillLibrary = config.skillLibrary ?? {};
  const skills = Object.values(skillLibrary);
  const enabledSkills = projectConfig?.enabledSkills ?? [];

  const repoPath = projectConfig?.repoPath ?? "";

  async function reloadConfig() {
    const updated = await invoke("get_config") as AppConfig;
    setConfig(updated);
  }

  async function handleToggle(name: string, enabled: boolean) {
    if (!slug || !projectConfig) return;
    try {
      await invoke("toggle_skill", { repoPath, skillName: name, enabled });
      await reloadConfig();
    } catch (e) {
      console.error("Failed to toggle skill:", e);
    }
  }

  async function handleToggleAll(enabled: boolean) {
    if (!slug || !projectConfig) return;
    try {
      for (const skill of skills) {
        const isEnabled = enabledSkills.includes(skill.name);
        if (isEnabled !== enabled) {
          await invoke("toggle_skill", { repoPath, skillName: skill.name, enabled });
        }
      }
      await reloadConfig();
    } catch (e) {
      console.error("Failed to toggle all skills:", e);
    }
  }

  async function handleInstalled(entry: SkillLibraryEntry) {
    if (slug && projectConfig) {
      await invoke("toggle_skill", { repoPath, skillName: entry.name, enabled: true });
    }
    await reloadConfig();
  }

  function handleInstallerDone() {
    setInstalling(false);
  }

  async function handleRemove(name: string) {
    try {
      if (enabledSkills.includes(name) && repoPath) {
        await invoke("toggle_skill", { repoPath, skillName: name, enabled: false });
      }
      await invoke("remove_library_skill", { skillName: name });
      await reloadConfig();
      if (viewing === name) setViewing(null);
    } catch (e) {
      console.error("Failed to remove skill:", e);
    }
  }

  const viewingSkill = viewing ? skillLibrary[viewing] : null;

  return (
    <PageShell title="Skills" subtitle={`Manage Claude Code skills for ${slug}`}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-600">Skills</label>
          <button
            onClick={() => setInstalling(true)}
            disabled={installing}
            className="rounded bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
          >
            + Install from Forge
          </button>
        </div>

        {installing && (
          <SkillInstaller
            projectSlug={slug}
            installedSkills={skillLibrary}
            onInstalled={handleInstalled}
            onCancel={handleInstallerDone}
          />
        )}

        <SkillList
          skills={skills}
          enabledSkills={enabledSkills}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onView={setViewing}
        />

        {viewingSkill && viewing && (
          <SkillDetail
            skillName={viewing}
            sourcePath={viewingSkill.sourcePath}
            onClose={() => setViewing(null)}
          />
        )}

        <p className="text-xs text-gray-400">
          Toggle ON copies skill to <code className="bg-gray-100 px-1 rounded">{`{repo}/.claude/skills/{name}/`}</code>.
          Toggle OFF removes it.
        </p>
      </div>
    </PageShell>
  );
}

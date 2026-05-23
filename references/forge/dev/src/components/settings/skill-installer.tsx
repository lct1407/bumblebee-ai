import { useState, useEffect } from "react";
import { invoke } from "@/hooks/use-tauri-ipc";
import { getRemoteSkills, getRemoteSkill } from "@/lib/api";
import type { SkillLibraryEntry, RemoteSkill } from "@/lib/types";

/** Compare semver strings numerically. Returns -1, 0, or 1. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

interface SkillInstallerProps {
  projectSlug?: string;
  installedSkills: Record<string, SkillLibraryEntry>;
  onInstalled: (entry: SkillLibraryEntry) => void;
  onCancel: () => void;
}

export function SkillInstaller({ projectSlug, installedSkills, onInstalled, onCancel }: SkillInstallerProps) {
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRemoteSkills(projectSlug)
      .then(setRemoteSkills)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectSlug]);

  async function installOne(skill: RemoteSkill): Promise<SkillLibraryEntry> {
    const full = await getRemoteSkill(skill.documentId);
    return await invoke("install_skill_from_strapi", {
      data: {
        name: full.name,
        description: full.description,
        version: full.version,
        skillMd: full.skillMd,
        files: full.files || [],
      },
    }) as SkillLibraryEntry;
  }

  async function handleInstall(skill: RemoteSkill) {
    setInstalling(skill.name);
    setError(null);
    try {
      const entry = await installOne(skill);
      onInstalled(entry);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
    }
  }

  async function handleInstallAll() {
    setInstallingAll(true);
    setError(null);
    try {
      for (const skill of available) {
        setInstalling(skill.name);
        const entry = await installOne(skill);
        onInstalled(entry);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
      setInstallingAll(false);
    }
  }

  // Filter out already installed skills with same or newer version
  const available = remoteSkills.filter((r) => {
    const local = installedSkills[r.name];
    if (!local) return true;
    return compareVersions(local.version, r.version) < 0; // update available
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Install from Forge</h3>
        <div className="flex items-center gap-2">
          {!loading && available.length > 1 && (
            <button
              onClick={handleInstallAll}
              disabled={installingAll}
              className="rounded bg-black px-3 py-1 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {installingAll ? "Installing..." : `Install All (${available.length})`}
            </button>
          )}
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>
      </div>

      {loading && <p className="text-xs text-gray-400">Loading remote skills...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {!loading && available.length === 0 && (
        <p className="text-xs text-gray-500">
          {remoteSkills.length === 0
            ? "No skills available in Forge."
            : "All skills are up to date."}
        </p>
      )}

      <div className="space-y-2">
        {available.map((skill) => {
          const local = installedSkills[skill.name];
          const isUpdate = !!local;
          return (
            <div
              key={skill.name}
              className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{skill.name}</p>
                <p className="truncate text-xs text-gray-400">{skill.description}</p>
                <p className="text-xs text-gray-300">
                  v{skill.version}
                  {isUpdate && <span className="ml-1 text-amber-500">(local: v{local.version})</span>}
                </p>
              </div>
              <button
                onClick={() => handleInstall(skill)}
                disabled={installingAll || installing === skill.name}
                className="ml-3 shrink-0 rounded bg-black px-3 py-1 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {installing === skill.name
                  ? "Installing..."
                  : isUpdate
                    ? "Update"
                    : "Install"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

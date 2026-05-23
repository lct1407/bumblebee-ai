import type { SkillLibraryEntry } from "@/lib/types";

interface SkillListProps {
  skills: SkillLibraryEntry[];
  enabledSkills: string[];
  onToggle: (name: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  onView: (name: string) => void;
}

export function SkillList({ skills, enabledSkills, onToggle, onToggleAll, onView }: SkillListProps) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center">
        <p className="text-sm text-gray-500">No skills installed yet.</p>
        <p className="mt-1 text-xs text-gray-400">Click "Install from Forge" to add skills to your library.</p>
      </div>
    );
  }

  const allEnabled = skills.every((s) => enabledSkills.includes(s.name));
  const anyEnabled = skills.some((s) => enabledSkills.includes(s.name));

  return (
    <div className="space-y-2">
      {skills.length > 1 && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onToggleAll(true)}
            disabled={allEnabled}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            Enable All
          </button>
          <button
            onClick={() => onToggleAll(false)}
            disabled={!anyEnabled}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            Disable All
          </button>
        </div>
      )}
      {skills.map((skill) => {
        const enabled = enabledSkills.includes(skill.name);
        return (
          <div
            key={skill.name}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => onToggle(skill.name, !enabled)}
                className={`h-4 w-8 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{skill.name}</p>
                <p className="truncate text-xs text-gray-400">{skill.description || skill.sourcePath}</p>
              </div>
            </div>
            <button
              onClick={() => onView(skill.name)}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200"
            >
              View
            </button>
          </div>
        );
      })}
    </div>
  );
}

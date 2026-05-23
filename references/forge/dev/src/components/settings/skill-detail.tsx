import { useEffect, useState } from "react";
import { invoke } from "@/hooks/use-tauri-ipc";
import type { SkillDetail as SkillDetailType } from "@/lib/types";

interface SkillDetailProps {
  skillName: string;
  sourcePath: string;
  onClose: () => void;
}

export function SkillDetail({ skillName, sourcePath, onClose }: SkillDetailProps) {
  const [detail, setDetail] = useState<SkillDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke("read_skill_detail", { sourcePath, skillName })
      .then((d) => setDetail(d as SkillDetailType))
      .catch((e) => setError(String(e)));
  }, [sourcePath, skillName]);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{skillName}</h3>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {detail && (
        <>
          {detail.content && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">SKILL.md</label>
              <pre className="max-h-64 overflow-auto rounded bg-white p-3 text-xs text-gray-700 whitespace-pre-wrap">
                {detail.content}
              </pre>
            </div>
          )}
          {detail.files.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Files ({detail.files.length})
              </label>
              <ul className="space-y-0.5">
                {detail.files.map((f) => (
                  <li key={f} className="text-xs text-gray-500 font-mono">{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!detail && !error && <p className="text-xs text-gray-400">Loading...</p>}
    </div>
  );
}

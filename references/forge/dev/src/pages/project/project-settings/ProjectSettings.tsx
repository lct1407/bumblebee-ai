import { useEffect, useRef } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { FormInput, FormTextarea } from "@/components/ui/form-input";
import { useProjectSettings } from "./useProjectSettings";

export function ProjectSettings() {
  const {
    slug,
    repoPath,
    setRepoPath,
    branch,
    setBranch,
    instructions,
    setInstructions,
    saved,
    indexingRepo,
    indexStatus,
    indexLog,
    handleIndex,
    handleSave,
  } = useProjectSettings();

  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [indexLog.length]);

  return (
    <PageShell title="Project Settings" subtitle={slug}>
      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Local Repo Path</label>
          <FormInput
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="e.g. C:\projects\my-app"
          />
          <p className="mt-1 text-xs text-gray-400">
            Path to the git repo on this machine. Used by Claude CLI agent.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">Branch</label>
          <div className="flex gap-2">
            <FormInput
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="flex-1"
            />
            {repoPath && (
              <button
                onClick={handleIndex}
                disabled={!!indexingRepo}
                className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {indexingRepo ? "Indexing..." : "Index Codebase"}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Agent checks out this branch before working. Also used for indexing.
          </p>
          {indexStatus && (
            <p className={`mt-1 text-xs font-medium ${indexStatus.includes("fail") ? "text-red-500" : indexStatus.includes("complete") ? "text-green-600" : "text-blue-500"}`}>
              {indexStatus}
            </p>
          )}
          {indexLog.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-900 p-3 font-mono text-xs text-gray-300">
              {indexLog.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">AI Instructions</label>
          <FormTextarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Custom instructions for AI when working on this project (optional)"
            rows={4}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-lg bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Save
          </button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PageShell>
  );
}

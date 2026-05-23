import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import { invoke } from "@/hooks/use-tauri-ipc";
import { getProject } from "@/lib/api";
import type { AppConfig, McpServerConfig } from "@/lib/types";

export function useProjectSettings() {
  const { slug } = useParams<{ slug: string }>();
  const { config, setConfig } = useAppStore();
  const projectConfig = slug ? config.projects[slug] : undefined;

  const [repoPath, setRepoPath] = useState(projectConfig?.repoPath ?? "");
  const [branch, setBranch] = useState(projectConfig?.branch ?? "main");
  const [instructions, setInstructions] = useState(projectConfig?.instructions ?? "");
  const [saved, setSaved] = useState(false);
  const [indexingRepo, setIndexingRepo] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const indexSessionRef = useRef<string | null>(null);
  const [indexLog, setIndexLog] = useState<string[]>([]);

  // Listen for agent events to track indexing progress
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const ul = await listen<{ sessionId: string; data: Record<string, unknown> }>(
          "agent:message",
          (event) => {
            if (cancelled) return;
            const { sessionId, data } = event.payload;
            if (sessionId !== indexSessionRef.current) return;

            // Capture streaming output for log
            if (data.type === "assistant") {
              const msg = data.message as Record<string, unknown> | undefined;
              const content = msg?.content as Array<{ type: string; text?: string; name?: string }> | undefined;
              if (Array.isArray(content)) {
                for (const c of content) {
                  if (c.type === "text" && c.text) {
                    setIndexLog((prev) => [...prev, c.text!]);
                  } else if (c.type === "tool_use") {
                    const input = (c as Record<string, unknown>).input as Record<string, unknown> | undefined;
                    let detail = "";
                    if (c.name === "Bash" && input?.command) {
                      detail = ` $ ${String(input.command).slice(0, 120)}`;
                    } else if (c.name === "Read" && input?.file_path) {
                      detail = ` ${input.file_path}`;
                    } else if (c.name === "Write" && input?.file_path) {
                      detail = ` ${input.file_path}`;
                    } else if (c.name === "Edit" && input?.file_path) {
                      detail = ` ${input.file_path}`;
                    } else if (c.name === "Glob" && input?.pattern) {
                      detail = ` ${input.pattern}`;
                    } else if (c.name === "Grep" && input?.pattern) {
                      detail = ` ${input.pattern}`;
                    } else if (input) {
                      detail = ` ${JSON.stringify(input).slice(0, 100)}`;
                    }
                    setIndexLog((prev) => [...prev, `⚡ ${c.name ?? "tool"}${detail}`]);
                  }
                }
              }
            } else if (data.type === "system") {
              const msg = (data.message as string) ?? "";
              if (msg) setIndexLog((prev) => [...prev, msg]);
            }

            if (data.type === "result") {
              const failed = (data.is_error as boolean) ?? false;
              setIndexStatus(failed ? "Indexing failed" : "Indexing complete!");
              setIndexingRepo(null);
              indexSessionRef.current = null;
              setTimeout(() => setIndexStatus(null), 3000);
            }
          },
        );
        if (cancelled) { ul(); return; }
        unlisten = ul;

        // Also listen for agent:complete to catch errors
        const ul2 = await listen<{ sessionId: string; error?: string }>(
          "agent:complete",
          (event) => {
            if (cancelled) return;
            if (event.payload.sessionId !== indexSessionRef.current) return;
            if (event.payload.error) {
              setIndexLog((prev) => [...prev, `Error: ${event.payload.error}`]);
              setIndexStatus("Indexing failed");
              setIndexingRepo(null);
              indexSessionRef.current = null;
            }
          },
        );
        if (cancelled) { ul2(); return; }
        const origUnlisten = unlisten;
        unlisten = () => { origUnlisten?.(); ul2(); };
      } catch {}
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function handleIndex() {
    if (!slug || !repoPath) return;
    setIndexingRepo(repoPath);
    setIndexStatus("Indexing codebase...");
    setIndexLog([]);
    try {
      const sessionId = await invoke<string>("index_codebase", {
        repoPath,
        branch,
      });
      indexSessionRef.current = sessionId;
    } catch (err) {
      setIndexingRepo(null);
      setIndexStatus(`Index failed: ${err}`);
      setTimeout(() => setIndexStatus(null), 3000);
    }
  }

  function ensureForgeMcp(servers: Record<string, McpServerConfig>, projectApiKey?: string, sentryProject?: string): Record<string, McpServerConfig> {
    const existing = servers["forge"];
    const headers: Record<string, string> = {};
    if (projectApiKey) {
      headers["X-Forge-API-Key"] = projectApiKey;
    }
    headers["X-Forge-Project-Slug"] = slug ?? "";
    if (sentryProject) {
      headers["X-Sentry-Project"] = sentryProject;
    }
    return {
      ...servers,
      forge: {
        type: "http",
        url: `${config.strapiUrl}/mcp`,
        headers,
        enabled: existing?.enabled ?? true,
      },
    };
  }

  async function handleSave() {
    if (!slug) return;

    // Fetch project API key for MCP auth
    let projectApiKey: string | undefined;
    let sentryProject: string | undefined;
    try {
      const project = await getProject(slug);
      projectApiKey = project?.apiKey;
      sentryProject = project?.sentryProject;
    } catch {}

    // Auto-detect MCP from repo + ensure Forge MCP
    let mcpServers = projectConfig?.mcpServers ?? {};
    try {
      const detected = (await invoke("detect_mcp_servers", { repoPath })) as Record<string, McpServerConfig>;
      if (detected && Object.keys(detected).length > 0) {
        mcpServers = { ...detected, ...mcpServers };
      }
    } catch {}
    mcpServers = ensureForgeMcp(mcpServers, projectApiKey, sentryProject);

    const updated: AppConfig = {
      ...config,
      projects: {
        ...config.projects,
        [slug]: { slug, repoPath, branch, instructions, mcpServers },
      },
    };
    setConfig(updated);
    await invoke("save_config", { config: updated });

    // Auto-install forge-issue skill to repo if repoPath is set
    if (repoPath) {
      try {
        await invoke("ensure_forge_issue_skill", { repoPath });
      } catch {
        // Non-fatal — skill can be installed manually later
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return {
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
  };
}

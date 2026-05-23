import { useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { invoke } from "./use-tauri-ipc";
import { relayAgentEvent, relayPromptBuilt, getIssue } from "@/lib/api";
import { buildIssuePrompt, buildMultiIssuePrompt } from "@/lib/prompt-builders";
import { buildAgentPrompt, buildAgentReindexPrompt, type AgentConfig } from "@/lib/agent-prompt";
import { SessionTracker } from "@/lib/session-tracker";

/**
 * Returns a stable ref holding the agent command handler.
 * Assign `handlerRef.current` inside your render loop to keep it fresh
 * without recreating the WebSocket connection.
 */
export function useAgentCommandHandler(tracker: SessionTracker) {
  const { config } = useAppStore();
  const configRef = useRef(config);
  configRef.current = config;

  const handlerRef = useRef(async (event: string, data: any) => {});

  handlerRef.current = async (event: string, data: any) => {
    const cfg = configRef.current;
    const pc = data.projectSlug ? cfg.projects[data.projectSlug] : undefined;
    const mcpServers =
      pc?.mcpServers && Object.keys(pc.mcpServers).length > 0
        ? pc.mcpServers
        : undefined;

    // No context prefix needed — skill fetches its own data via MCP
    const contextPrefix = "";

    // Emit user message to local UI so useAgentChat can display it
    async function emitUserMessage(sessionId: string, message: string) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        emit("agent:user-message", { sessionId, content: message });
      } catch {
        /* ignore */
      }
    }

    if (event === "agent:start") {
      const { sessionId, prompt, projectSlug, preBuilt } = data;
      const repoPath = pc?.repoPath || data.repoPath;
      console.log(
        "[agent:start] repoPath:",
        repoPath,
        "local:",
        pc?.repoPath,
        "strapi:",
        data.repoPath,
        "preBuilt:",
        !!preBuilt,
      );
      const enrichedPrompt = preBuilt ? prompt : contextPrefix + prompt;

      // Notify local UI to adopt this session (so useAgentChat shows running status)
      try {
        const { emit } = await import("@tauri-apps/api/event");
        emit("agent:session-adopted", { sessionId, prompt, projectSlug });
      } catch {
        /* ignore */
      }

      // Track session locally — same save logic as desktop-originated sessions
      tracker.start(sessionId, projectSlug ?? "", prompt, { repoPath });

      try {
        await invoke("send_chat", {
          repoPath,
          message: enrichedPrompt,
          sessionId,
          claudeSessionId: null,
          projectSlug,
          mcpServers,
        });
      } catch (err) {
        try {
          await relayAgentEvent(sessionId, "agent:complete", {
            error: String(err),
          });
        } catch {
          /* ignore */
        }
      }
    } else if (event === "agent:send") {
      const { sessionId, message, claudeSessionId, projectSlug } = data;
      const repoPath = pc?.repoPath || data.repoPath;
      await emitUserMessage(sessionId, message);
      tracker.addUserMessage(sessionId, message, claudeSessionId);
      try {
        await invoke("send_chat", {
          sessionId,
          message,
          claudeSessionId,
          repoPath,
          projectSlug,
          mcpServers,
        });
      } catch (err) {
        try {
          await relayAgentEvent(sessionId, "agent:complete", {
            error: String(err),
          });
        } catch {
          /* ignore */
        }
      }
    } else if (event === "agent:abort") {
      const { sessionId } = data;
      try {
        await invoke("abort_agent", { sessionId });
      } catch {
        /* ignore */
      }
    } else if (event === "agent:review" || event === "agent:reindex") {
      const { sessionId, projectSlug, agentConfig } = data;
      const repoPath = pc?.repoPath || data.repoPath;
      console.log(
        `[${event}] repoPath:`,
        repoPath,
        "projectSlug:",
        projectSlug,
      );

      const prompt =
        event === "agent:review"
          ? buildAgentPrompt(agentConfig as AgentConfig, projectSlug)
          : buildAgentReindexPrompt(agentConfig as AgentConfig, projectSlug);

      // Notify local UI to adopt this session
      try {
        const { emit } = await import("@tauri-apps/api/event");
        emit("agent:session-adopted", { sessionId, prompt, projectSlug });
      } catch {
        /* ignore */
      }

      tracker.start(sessionId, projectSlug ?? "", prompt, { repoPath });

      try {
        await invoke("send_chat", {
          repoPath,
          message: prompt,
          sessionId,
          claudeSessionId: null,
          projectSlug,
          mcpServers,
        });
      } catch (err) {
        try {
          await relayAgentEvent(sessionId, "agent:complete", {
            error: String(err),
          });
        } catch {
          /* ignore */
        }
      }
    } else if (event === "agent:build-prompt") {
      const { requestId, projectSlug: ps, issueIds } = data;
      console.log("[build-prompt] desktop received", {
        requestId,
        projectSlug: ps,
        issueIds,
      });

      try {
        const issues = await Promise.all(
          (issueIds as string[]).map((id: string) => getIssue(id)),
        );
        console.log("[build-prompt] fetched issues:", issues.length);

        const prompt =
          issues.length === 1
            ? buildIssuePrompt(issues[0])
            : buildMultiIssuePrompt(issues);

        console.log(
          "[build-prompt] built prompt, length:",
          prompt.length,
          "relaying back...",
        );
        await relayPromptBuilt(requestId, prompt);
        console.log("[build-prompt] relay success");
      } catch (err) {
        console.error("[build-prompt] Failed to build prompt:", err);
        try {
          await relayPromptBuilt(requestId, "", String(err));
        } catch {
          /* ignore */
        }
      }
    }
  };

  return handlerRef;
}

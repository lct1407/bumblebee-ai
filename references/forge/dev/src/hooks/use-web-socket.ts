import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { invoke } from "./use-tauri-ipc";
import { registerDesktop, unregisterDesktop, relayAgentEvent } from "@/lib/api";
import { SessionTracker } from "@/lib/session-tracker";
import { useAgentCommandHandler } from "./use-agent-commands";

// Single tracker instance shared across the hook lifecycle
const tracker = new SessionTracker();

export function useWebSocket() {
  const { config, setWsConnected } = useAppStore();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  // Stable ref for agent command handling — avoids re-creating WS on config changes
  const handleAgentCommandRef = useAgentCommandHandler(tracker);

  useEffect(() => {
    if (!config.strapiUrl) return;

    const wsUrl = config.strapiUrl.replace(/^http/, "ws") + "/ws";

    function handleMessage(data: any) {
      try {
        const msg = typeof data === "string" ? JSON.parse(data) : data;
        const event: string = msg.event ?? "";

        if (
          event === "agent:start" ||
          event === "agent:send" ||
          event === "agent:abort" ||
          event === "agent:build-prompt" ||
          event === "agent:review" ||
          event === "agent:reindex"
        ) {
          handleAgentCommandRef.current(event, msg.data);
          return;
        }

        if (event === "notification:created") {
          ["notifications", "notifications-unread"].forEach((k) =>
            queryClient.invalidateQueries({ queryKey: [k], refetchType: "all" }),
          );
        }

        if (
          event.startsWith("issue:") ||
          event.startsWith("task:") ||
          event.startsWith("agent:")
        ) {
          const keys =
            event.startsWith("task:") || event.startsWith("agent:")
              ? ["tasks"]
              : ["issues", "issue", "comments"];
          keys.forEach((k) =>
            queryClient.invalidateQueries({ queryKey: [k], refetchType: "all" }),
          );
        }
      } catch {
        // ignore
      }
    }

    function registerAsDesktop(ws: WebSocket) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "desktop:register" }));
      }
    }

    let cancelled = false;

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) return undefined;

        const unlisten1 = await listen("ws:connected", async () => {
          setWsConnected(true);
          queryClient.invalidateQueries();
          try {
            await registerDesktop();
          } catch {
            /* ignore */
          }
        });
        const unlisten2 = await listen("ws:disconnected", async () => {
          setWsConnected(false);
          try {
            await unregisterDesktop();
          } catch {
            /* ignore */
          }
        });
        const unlisten3 = await listen<unknown>("ws:message", (event) => {
          handleMessage(event.payload);
        });
        const unlisten4 = await listen("ws:error", () => {
          setWsConnected(false);
        });

        // Batch relay: accumulate agent:message events and flush periodically
        const relayQueue: { sessionId: string; event: string; data: any }[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const FLUSH_INTERVAL = 100; // ms

        async function flushRelay() {
          flushTimer = null;
          if (relayQueue.length === 0) return;
          const batch = relayQueue.splice(0, relayQueue.length);
          const bySession = new Map<string, { event: string; data: any }[]>();
          for (const item of batch) {
            let arr = bySession.get(item.sessionId);
            if (!arr) {
              arr = [];
              bySession.set(item.sessionId, arr);
            }
            arr.push({ event: item.event, data: item.data });
          }
          for (const [sid, items] of bySession) {
            try {
              await relayAgentEvent(sid, "agent:batch", { items });
            } catch {
              /* ignore */
            }
          }
        }

        function enqueueRelay(sessionId: string, event: string, data: any) {
          relayQueue.push({ sessionId, event, data });
          if (!flushTimer) {
            flushTimer = setTimeout(flushRelay, FLUSH_INTERVAL);
          }
        }

        const unlisten5 = await listen<{ sessionId: string; data: any }>(
          "agent:message",
          (event) => {
            const { sessionId, data: agentData } = event.payload;
            enqueueRelay(sessionId, "agent:message", agentData);
            // Update local session tracking (same merge logic as useAgentChat)
            tracker.handleStreamData(sessionId, agentData);
          },
        );

        const unlisten6 = await listen<{ sessionId: string; error?: string }>(
          "agent:complete",
          async (event) => {
            const { sessionId, ...rest } = event.payload;
            await flushRelay();

            // Try to compute branch diff and include it in the relay
            let diffData: unknown = undefined;
            const trackedSession = tracker.getSession(sessionId);
            const worktreeBranch = trackedSession?.worktreeBranch;
            if (worktreeBranch) {
              const repoPath = trackedSession?.repoPath;
              if (repoPath) {
                try {
                  diffData = await invoke("get_branch_diff", {
                    repoPath,
                    branch: worktreeBranch,
                    base: "HEAD",
                  });
                } catch {
                  /* ignore diff errors */
                }
              }
            }

            try {
              await relayAgentEvent(sessionId, "agent:complete", {
                ...rest,
                diff: diffData,
              });
            } catch {
              /* ignore */
            }
            // Final save + cleanup
            tracker.complete(sessionId);
          },
        );

        await invoke("connect_ws", { url: wsUrl });

        return () => {
          if (flushTimer) clearTimeout(flushTimer);
          tracker.dispose();
          unlisten1();
          unlisten2();
          unlisten3();
          unlisten4();
          unlisten5();
          unlisten6();
        };
      } catch {
        // Not in Tauri — use native WebSocket as fallback
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          setWsConnected(true);
          queryClient.invalidateQueries();
          registerAsDesktop(ws);
        };
        ws.onclose = () => setWsConnected(false);
        ws.onmessage = (e) => handleMessage(e.data);
        return () => ws.close();
      }
    }

    let cleanup: (() => void) | undefined;
    setupListeners().then((fn) => {
      if (cancelled && fn) {
        fn();
      } else {
        cleanup = fn;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [config.strapiUrl, setWsConnected, queryClient]);
}

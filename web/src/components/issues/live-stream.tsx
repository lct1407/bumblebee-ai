"use client";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LiveSession, WsStatus } from "@/lib/event-stream";
import { cn } from "@/lib/utils";

/**
 * Renders all currently-streaming Claude CLI sessions for an issue.
 * Each session card shows accumulating tokens + tool calls + status header.
 * Auto-scrolls the buffer; pauses scroll if user scrolls up.
 */
export function LiveStream({
  sessions,
  status,
}: {
  sessions: Record<string, LiveSession>;
  status: WsStatus;
}) {
  const list = Object.values(sessions)
    .filter((s) => s.status !== "completed" || (s.endedAt && Date.now() - new Date(s.endedAt).getTime() < 60_000))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const connectionDot =
    status === "open"
      ? "var(--status-success)"
      : status === "connecting"
      ? "var(--status-warning)"
      : "var(--status-danger)";

  if (list.length === 0) {
    return (
      <div
        className="rounded-lg border px-4 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{ background: connectionDot }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Live stream ready · subscribed to <code className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>/ws</code>
          </span>
        </div>
        <span className="t-tiny" style={{ color: "var(--text-tertiary)" }}>
          Trigger a workflow to see streaming output
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {list.map((s) => (
          <motion.div
            key={s.sessionId}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <LiveSessionCard session={s} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LiveSessionCard({ session }: { session: LiveSession }) {
  const bufRef = useRef<HTMLPreElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = bufRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [session.buffer]);

  const onScroll = (e: React.UIEvent<HTMLPreElement>) => {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  };

  const dotColor =
    session.status === "completed"
      ? "var(--status-success)"
      : session.status === "errored"
      ? "var(--status-danger)"
      : "var(--accent)";

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <header
        className="flex items-center gap-3 px-3.5 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            session.status === "streaming" && "animate-pulse",
          )}
          style={{ background: dotColor }}
        />
        <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
          {session.role ? session.role : "agent"}
        </span>
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          #{session.sessionId.slice(0, 8)}
        </span>
        {session.model && (
          <span className="t-tiny" style={{ color: "var(--text-tertiary)" }}>
            · {session.model}
          </span>
        )}
        <span
          className="ml-auto t-tiny font-medium"
          style={{ color: dotColor }}
        >
          {labelFor(session.status)}
        </span>
        {session.tokensOut != null && (
          <span className="t-tiny tabular-nums font-mono" style={{ color: "var(--text-tertiary)" }}>
            {session.tokensOut} tok
          </span>
        )}
        {session.costUsd != null && session.costUsd > 0 && (
          <span className="t-tiny tabular-nums font-mono" style={{ color: "var(--accent)" }}>
            ${session.costUsd.toFixed(4)}
          </span>
        )}
      </header>

      {session.buffer && (
        <pre
          ref={bufRef}
          onScroll={onScroll}
          className="max-h-72 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed font-mono whitespace-pre-wrap m-0"
          style={{ color: "var(--text-primary)" }}
        >
          {session.buffer}
          {session.status === "streaming" && (
            <span className="inline-block w-1.5 h-3 align-middle ml-0.5 animate-pulse" style={{ background: "var(--accent)" }} />
          )}
        </pre>
      )}

      {session.toolUses.length > 0 && (
        <div className="px-3.5 py-2 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
          <div className="t-overline" style={{ color: "var(--text-tertiary)" }}>
            Tool calls · {session.toolUses.length}
          </div>
          <ul className="space-y-1">
            {session.toolUses.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[12px]">
                <span
                  className="font-mono px-1.5 py-0.5 rounded font-medium"
                  style={{ background: "var(--bg-subtle)", color: "var(--accent)" }}
                >
                  {t.name}
                </span>
                {t.input && (
                  <code
                    className="font-mono truncate text-[11px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {JSON.stringify(t.input).slice(0, 80)}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {session.error && (
        <div
          className="px-3.5 py-2 border-t text-[12px] font-mono"
          style={{ borderColor: "var(--border)", color: "var(--status-danger)" }}
        >
          {session.error}
        </div>
      )}
    </div>
  );
}

function labelFor(s: LiveSession["status"]): string {
  switch (s) {
    case "starting": return "Starting";
    case "streaming": return "Streaming";
    case "completed": return "Completed";
    case "errored": return "Errored";
  }
}

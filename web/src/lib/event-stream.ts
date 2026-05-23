/**
 * WebSocket client for live event + LLM-chunk streaming.
 *
 * Backend broadcasts two message families on /ws?project=<slug>:
 *
 * 1) Persisted events (any append_event → DB):
 *    { id, type, issue_id, session_id, actor, payload, occurred_at }
 *
 * 2) Ephemeral LLM stream chunks (broadcast only, NOT in DB):
 *    { id: "chunk-<sessionId>-<seq>",
 *      type: "llm.chunk",
 *      session_id, issue_id, actor,
 *      payload: { type: "delta"|"tool_use"|"completed"|... , text?, seq, ... },
 *      occurred_at }
 *
 * `useEventStream(opts)` returns:
 *   - events:  persisted events (filtered by issue_id if provided)
 *   - chunks:  in-flight llm.chunk messages keyed by session_id
 *   - status:  ws connection state
 */
"use client";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface StreamEvent {
  id: string;
  type: string;
  issue_id?: string | null;
  session_id?: string | null;
  actor?: string | null;
  payload?: Record<string, any>;
  occurred_at: string;
}

export interface ChunkPayload {
  type:
    | "stream_started"
    | "stream_ended"
    | "started"
    | "delta"
    | "tool_use"
    | "tool_result"
    | "completed"
    | "error";
  text?: string;
  seq?: number;
  name?: string;
  input?: any;
  output?: any;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  message?: string;
  role?: string;
}

export interface LiveSession {
  sessionId: string;
  role?: string;
  model?: string;
  buffer: string;
  toolUses: { name: string; input: any }[];
  status: "starting" | "streaming" | "completed" | "errored";
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

export type WsStatus = "connecting" | "open" | "closed" | "error";

export function useEventStream({
  project,
  issueId,
  enabled = true,
}: {
  project: string;
  issueId?: string;
  enabled?: boolean;
}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [sessions, setSessions] = useState<Record<string, LiveSession>>({});
  const [status, setStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const connect = () => {
      const wsUrl = API_URL.replace(/^http/, "ws") + `/ws?project=${encodeURIComponent(project)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => setStatus("open");

      ws.onmessage = (msg) => {
        let data: any;
        try {
          data = JSON.parse(msg.data);
        } catch {
          return;
        }

        // Server hello
        if (data.type === "ws_hello") return;

        // LLM chunk → live session buffer
        if (data.type === "llm.chunk") {
          if (issueId && data.issue_id && data.issue_id !== issueId) return;
          const sid: string = data.session_id;
          const p: ChunkPayload = data.payload || {};
          setSessions((prev) => {
            const existing: LiveSession = prev[sid] || {
              sessionId: sid,
              role: data.actor,
              buffer: "",
              toolUses: [],
              status: "starting",
              startedAt: data.occurred_at,
            };
            const next: LiveSession = { ...existing };
            switch (p.type) {
              case "stream_started":
                next.status = "streaming";
                next.role = p.role || next.role;
                next.buffer = "";
                next.toolUses = [];
                break;
              case "started":
                next.model = p.model;
                next.status = "streaming";
                break;
              case "delta":
                if (p.text) next.buffer += p.text;
                next.status = "streaming";
                break;
              case "tool_use":
                if (p.name) next.toolUses = [...next.toolUses, { name: p.name, input: p.input }];
                break;
              case "completed":
                next.tokensIn = p.tokens_in;
                next.tokensOut = p.tokens_out;
                next.costUsd = p.cost_usd;
                break;
              case "stream_ended":
                next.status = "completed";
                next.endedAt = data.occurred_at;
                break;
              case "error":
                next.status = "errored";
                next.error = p.message;
                next.endedAt = data.occurred_at;
                break;
            }
            return { ...prev, [sid]: next };
          });
          return;
        }

        // Persisted event
        if (data.id && data.type && data.occurred_at) {
          if (issueId && data.issue_id && data.issue_id !== issueId) return;
          setEvents((prev) => {
            if (prev.find((e) => e.id === data.id)) return prev; // dedupe
            return [data as StreamEvent, ...prev].slice(0, 500);
          });
        }
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (cancelled) return;
        // Exponential-ish reconnect with 2s floor
        reconnectRef.current = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [project, issueId, enabled]);

  return { events, sessions, status };
}

"use client";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NotificationsApi } from "@/lib/api-client";
import { Skeleton, EmptyState } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => NotificationsApi.list({ unread_only: filter === "unread" }),
    refetchInterval: 5000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => NotificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data ?? [];
  const unreadCount = items.filter((n: any) => !n.is_read).length;

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="t-display flex items-center gap-2.5" style={{ color: "var(--text-primary)" }}>
            Inbox
            {unreadCount > 0 && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            Workflow updates, mentions, and system alerts
          </p>
        </div>

        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-md border"
          style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
        >
          {(["all", "unread"] as const).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded text-sm font-medium transition"
                style={{
                  background: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                }}
              >
                {f === "all" ? "All" : `Unread (${unreadCount})`}
              </button>
            );
          })}
        </div>
      </motion.div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed" style={{ borderColor: "var(--border-strong)" }}>
          <EmptyState
            title={filter === "unread" ? "Inbox zero" : "No notifications"}
            description={
              filter === "unread"
                ? "You're all caught up. Switch to All to see read notifications."
                : "Workflow events and system alerts will appear here."
            }
          />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((n: any, idx: number) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.025 }}
              onClick={() => !n.is_read && markRead.mutate(n.id)}
              className="relative rounded-lg border p-3 cursor-pointer transition hover:bg-[var(--bg-subtle)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border)",
                opacity: n.is_read ? 0.65 : 1,
              }}
            >
              {!n.is_read && (
                <span
                  className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r"
                  style={{ background: "var(--accent)" }}
                />
              )}
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
                >
                  {iconFor(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      className="text-sm"
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: n.is_read ? 500 : 600,
                      }}
                    >
                      {n.title}
                    </h3>
                    <span className="text-[11px] flex-shrink-0 tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{n.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="t-overline px-1.5 py-0.5 rounded font-mono"
                      style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
                    >
                      {n.type}
                    </span>
                  </div>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function iconFor(type: string): string {
  if (type?.includes("complete") || type?.includes("success")) return "✓";
  if (type?.includes("fail") || type?.includes("error")) return "✕";
  if (type?.includes("mention")) return "@";
  if (type?.includes("workflow")) return "▸";
  if (type?.includes("comment")) return "·";
  return "•";
}

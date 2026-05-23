import { cn } from "@/lib/utils";

/* Status badges: subtle dot + neutral chip background. The dot color carries the semantic info,
   the chip stays bg-subtle to avoid 9 colored pills competing for attention. */
const STATUS_DOT: Record<string, string> = {
  new:         "var(--status-info)",
  triaged:     "var(--status-purple)",
  planned:     "var(--status-purple)",
  approved:    "var(--status-info)",
  in_progress: "var(--status-warning)",
  in_review:   "var(--status-purple)",
  closed:      "var(--status-success)",
  failed:      "var(--status-danger)",
  wont_fix:    "var(--status-neutral)",
};

const PRIORITY_TOKENS: Record<string, string> = {
  critical: "var(--status-danger)",
  high:     "var(--status-warning)",
  medium:   "var(--text-secondary)",
  low:      "var(--text-tertiary)",
  none:     "var(--text-quaternary)",
};

export function Badge({
  children,
  className = "",
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline";
}) {
  const base = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border";
  return (
    <span
      className={cn(base, className)}
      style={
        variant === "outline"
          ? { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--border)" }
          : { background: "var(--bg-subtle)", color: "var(--text-secondary)", borderColor: "transparent" }
      }
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOT[status] || "var(--text-tertiary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium"
      style={{ background: "transparent", color: "var(--text-secondary)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const icons: Record<string, string> = {
    critical: "▲",
    high: "▴",
    medium: "■",
    low: "▾",
    none: "·",
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-medium"
      style={{ color: PRIORITY_TOKENS[priority] || "var(--text-tertiary)" }}
    >
      <span className="text-[10px]">{icons[priority] || "·"}</span>
      {priority}
    </span>
  );
}

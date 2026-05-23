"use client";
import { motion } from "framer-motion";

export function StatCard({
  label,
  value,
  hint,
  trend,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  /** @deprecated kept for backwards compat — color prop now no-ops */
  color?: string;
  accent?: boolean;
}) {
  const trendColor =
    trend?.direction === "up" ? "var(--status-success)" :
    trend?.direction === "down" ? "var(--status-danger)" :
    "var(--text-tertiary)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -1 }}
      className="rounded-xl border p-4 transition"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="t-overline" style={{ color: "var(--text-tertiary)" }}>{label}</div>
        {trend && (
          <div className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: trendColor }}>
            {trend.direction === "up" && "↗"}
            {trend.direction === "down" && "↘"}
            {trend.direction === "flat" && "→"}
            {trend.value}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"
        style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 t-small" style={{ color: "var(--text-tertiary)" }}>{hint}</div>}
    </motion.div>
  );
}

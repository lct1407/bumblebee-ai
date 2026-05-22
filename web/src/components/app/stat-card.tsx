"use client";
import { motion } from "framer-motion";

export function StatCard({
  label,
  value,
  hint,
  trend,
  color = "amber",
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  color?: "amber" | "emerald" | "blue" | "purple" | "rose";
}) {
  const colorMap = {
    amber: "from-amber-500/20 to-orange-500/5 border-amber-500/30",
    emerald: "from-emerald-500/20 to-teal-500/5 border-emerald-500/30",
    blue: "from-blue-500/20 to-cyan-500/5 border-blue-500/30",
    purple: "from-purple-500/20 to-pink-500/5 border-purple-500/30",
    rose: "from-rose-500/20 to-amber-500/5 border-rose-500/30",
  };
  const trendColor = trend?.direction === "up" ? "text-emerald-500" : trend?.direction === "down" ? "text-rose-500" : "text-zinc-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -2 }}
      className={`rounded-2xl border bg-gradient-to-br ${colorMap[color]} backdrop-blur p-5 transition`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">{label}</div>
        {trend && (
          <div className={`text-xs font-semibold ${trendColor} flex items-center gap-0.5`}>
            {trend.direction === "up" && "↗"}
            {trend.direction === "down" && "↘"}
            {trend.direction === "flat" && "→"}
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </motion.div>
  );
}

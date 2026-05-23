"use client";
import { motion } from "framer-motion";

export type ViewMode = "list" | "board" | "stats";

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: "list",
    label: "List",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: "board",
    label: "Board",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="4" width="6" height="16" rx="1" />
        <rect x="11" y="4" width="6" height="10" rx="1" />
        <rect x="19" y="4" width="2" height="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "stats",
    label: "Stats",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
      </svg>
    ),
  },
];

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md border"
      style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
    >
      {VIEWS.map((v) => {
        const active = value === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className="relative px-2 py-1 rounded text-sm font-medium transition flex items-center gap-1.5"
            style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}
          >
            {active && (
              <motion.div
                layoutId="view-active"
                className="absolute inset-0 rounded -z-10"
                style={{ background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            {v.icon}
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

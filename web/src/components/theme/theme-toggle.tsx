"use client";
import { motion } from "framer-motion";
import { useTheme, type ThemeMode } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "light",
    label: "Light",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    mode: "system",
    label: "Auto",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    mode: "dark",
    label: "Dark",
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();

  if (compact) {
    const current = OPTIONS.find((o) => o.mode === mode) || OPTIONS[1];
    const next = OPTIONS[(OPTIONS.findIndex((o) => o.mode === mode) + 1) % OPTIONS.length];
    return (
      <button
        onClick={() => setMode(next.mode)}
        title={`Theme: ${current.label} → ${next.label}`}
        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-subtle)] transition"
        style={{ color: "var(--text-tertiary)" }}
      >
        {current.icon}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
      style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(o.mode)}
            title={o.label}
            className={cn(
              "relative px-2 py-1 rounded text-[11px] font-medium transition flex items-center gap-1",
            )}
            style={{
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            {active && (
              <motion.span
                layoutId="theme-toggle-active"
                className="absolute inset-0 rounded -z-10"
                style={{ background: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

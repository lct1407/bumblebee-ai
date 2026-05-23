"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders the acceptance-criteria markdown as an interactive checklist.
 * Each `- [ ]` / `- [x]` line is a toggleable item.
 * onChange writes back the updated markdown.
 */
export function AcceptanceChecklist({
  text,
  onChange,
  readonly = false,
}: {
  text: string;
  onChange?: (next: string) => void;
  readonly?: boolean;
}) {
  const items = useMemo(() => parseChecklist(text), [text]);

  if (!items.length) {
    return (
      <p className="t-small italic" style={{ color: "var(--text-tertiary)" }}>
        No acceptance criteria defined yet.
      </p>
    );
  }

  const toggle = (index: number) => {
    if (readonly || !onChange) return;
    const lines = text.split(/\r?\n/);
    let cursor = 0;
    const next = lines.map((line) => {
      const match = line.match(/^([\s-*]*)\[([ xX])\](.*)$/);
      if (!match) return line;
      if (cursor === index) {
        const checked = /[xX]/.test(match[2]);
        cursor++;
        return `${match[1]}[${checked ? " " : "x"}]${match[3]}`;
      }
      cursor++;
      return line;
    });
    onChange(next.join("\n"));
  };

  const done = items.filter((i) => i.checked).length;
  const pct = items.length > 0 ? (done / items.length) * 100 : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ background: "var(--status-success)", width: `${pct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>
          {done}/{items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 py-1">
            <button
              type="button"
              onClick={() => toggle(idx)}
              disabled={readonly}
              className={cn(
                "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition mt-0.5",
                !readonly && "cursor-pointer hover:border-[var(--accent)]",
              )}
              style={{
                background: item.checked ? "var(--status-success)" : "transparent",
                borderColor: item.checked ? "var(--status-success)" : "var(--border-strong)",
              }}
              aria-checked={item.checked}
              role="checkbox"
            >
              {item.checked && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span
              className="text-sm flex-1"
              style={{
                color: item.checked ? "var(--text-tertiary)" : "var(--text-primary)",
                textDecoration: item.checked ? "line-through" : undefined,
              }}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function parseChecklist(text: string): { checked: boolean; text: string }[] {
  if (!text) return [];
  const items: { checked: boolean; text: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^[\s-*]*\[([ xX])\]\s*(.*)$/);
    if (m) items.push({ checked: /[xX]/.test(m[1]), text: m[2].trim() });
  }
  return items;
}

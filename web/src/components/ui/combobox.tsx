"use client";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  multiple = false,
}: {
  options: ComboOption[];
  value: string | string[];
  onChange: (v: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedLabels = options.filter((o) => selectedValues.includes(o.value));

  const display = () => {
    if (selectedLabels.length === 0)
      return <span style={{ color: "var(--text-tertiary)" }}>{placeholder}</span>;
    if (multiple && selectedLabels.length > 2) {
      return <span style={{ color: "var(--text-primary)" }}>{selectedLabels.length} selected</span>;
    }
    return (
      <span className="flex items-center gap-1 flex-wrap" style={{ color: "var(--text-primary)" }}>
        {selectedLabels.map((o) => (
          <span key={o.value} className="inline-flex items-center gap-1">
            {o.icon}
            <span>{o.label}</span>
          </span>
        ))}
      </span>
    );
  };

  const toggle = (v: string) => {
    if (multiple) {
      const next = selectedValues.includes(v)
        ? selectedValues.filter((x) => x !== v)
        : [...selectedValues, v];
      onChange(next);
    } else {
      onChange(v);
      setOpen(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-sm text-left min-w-[120px] transition",
            className,
          )}
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <span className="truncate flex-1">{display()}</span>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--text-tertiary)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-60 rounded-lg border overflow-hidden"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Command className="flex flex-col">
            <Command.Input
              placeholder={searchPlaceholder}
              className="px-3 py-2 text-sm border-b bg-transparent outline-none"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-sm text-center" style={{ color: "var(--text-tertiary)" }}>
                No matches
              </Command.Empty>
              {options.map((o) => {
                const selected = selectedValues.includes(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={o.label + " " + o.value}
                    onSelect={() => toggle(o.value)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition aria-selected:bg-[var(--accent-subtle)]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {multiple && (
                      <span
                        className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition"
                        style={{
                          background: selected ? "var(--accent)" : "transparent",
                          borderColor: selected ? "var(--accent)" : "var(--border-strong)",
                        }}
                      >
                        {selected && (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" style={{ color: "var(--accent-fg)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {o.icon}
                    <span className="flex-1">{o.label}</span>
                    {o.hint && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{o.hint}</span>}
                    {!multiple && selected && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

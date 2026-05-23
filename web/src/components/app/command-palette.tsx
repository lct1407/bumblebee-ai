"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectsApi, IssuesApi, getActiveProject, setActiveProject } from "@/lib/api-client";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [project, setProject] = useState("bb");
  useEffect(() => setProject(getActiveProject()), []);

  const projects = useQuery({ queryKey: ["projects"], queryFn: ProjectsApi.list, enabled: open });
  const issues = useQuery({
    queryKey: ["issues", project],
    queryFn: () => IssuesApi.list(project),
    enabled: open,
  });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 backdrop-blur-md"
                style={{ background: "rgba(0,0,0,0.45)" }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed left-1/2 top-[14vh] z-50 -translate-x-1/2 w-full max-w-2xl px-4"
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <Command
                  label="Command palette"
                  className="rounded-xl border overflow-hidden"
                  style={{
                    background: "var(--bg-elevated)",
                    borderColor: "var(--border-strong)",
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  <div className="flex items-center px-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--text-tertiary)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                    <Command.Input
                      autoFocus
                      placeholder="Search issues, jump to pages, switch projects…"
                      className="flex-1 px-3 py-3.5 text-[15px] bg-transparent outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <kbd
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
                    >
                      ESC
                    </kbd>
                  </div>
                  <Command.List className="max-h-96 overflow-y-auto p-1.5">
                    <Command.Empty className="px-3 py-10 text-sm text-center" style={{ color: "var(--text-tertiary)" }}>
                      No results found.
                    </Command.Empty>

                    <Group heading="Navigation">
                      <Item label="Dashboard" hint="G D" onSelect={() => go("/dashboard")} />
                      <Item label="Issues" hint="G I" onSelect={() => go("/issues")} />
                      <Item label="Inbox" hint="G N" onSelect={() => go("/notifications")} />
                      <Item label="Plugins" hint="G P" onSelect={() => go("/plugins")} />
                    </Group>

                    <Group heading="Actions">
                      <Item label="Create new issue" hint="C" onSelect={() => go("/issues?new=1")} />
                      <Item label="Trigger workflow" hint="T" onSelect={() => go("/issues")} />
                    </Group>

                    {(projects.data?.length ?? 0) > 0 && (
                      <Group heading="Switch project">
                        {projects.data!.map((p) => (
                          <Item
                            key={p.id}
                            label={p.name}
                            hint={p.key}
                            onSelect={() => {
                              setActiveProject(p.slug);
                              onOpenChange(false);
                              window.location.reload();
                            }}
                          />
                        ))}
                      </Group>
                    )}

                    {(issues.data?.length ?? 0) > 0 && (
                      <Group heading="Issues">
                        {issues.data!.slice(0, 20).map((i) => (
                          <Item
                            key={i.id}
                            label={i.title}
                            hint={`${project.toUpperCase()}-${i.number}`}
                            onSelect={() => go(`/issues/${i.number}`)}
                          />
                        ))}
                      </Group>
                    )}
                  </Command.List>

                  <div
                    className="px-3 py-2 border-t flex items-center gap-3 text-[11px]"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-subtle)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <Kbd>↑↓</Kbd> Navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <Kbd>↵</Kbd> Select
                    </span>
                    <span className="ml-auto font-mono">Bumblebee v0.4</span>
                  </div>
                </Command>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading}>
      <div className="px-2 py-1.5 t-overline" style={{ color: "var(--text-quaternary)" }}>{heading}</div>
      {children}
    </Command.Group>
  );
}

function Item({ label, hint, onSelect }: { label: string; hint?: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={label + " " + (hint ?? "")}
      onSelect={onSelect}
      className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition aria-selected:bg-[var(--accent-subtle)] aria-selected:text-[var(--accent)]"
      style={{ color: "var(--text-secondary)" }}
    >
      <span className="flex-1 text-sm truncate">{label}</span>
      {hint && (
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
        >
          {hint}
        </span>
      )}
    </Command.Item>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="font-mono px-1 py-0.5 rounded"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
    >
      {children}
    </kbd>
  );
}

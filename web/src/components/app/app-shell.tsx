"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { WhatsNewModal } from "@/components/app/whats-new-modal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "var(--bg-canvas)", color: "var(--text-primary)" }}
    >
      <Sidebar onCmdK={() => setCmdOpen(true)} />
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <WhatsNewModal />
    </div>
  );
}

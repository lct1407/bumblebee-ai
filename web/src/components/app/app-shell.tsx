"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { WhatsNewModal } from "@/components/app/whats-new-modal";
import { getAuthToken } from "@/lib/api-client";
import { HexMark } from "@/components/ui/hex-mark";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Auth guard: every /(app) route requires a token — bounce to /login otherwise.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/login");
      setAuthed(false);
      return;
    }
    setAuthed(true);
  }, [router]);

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

  if (authed !== true) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: "var(--bg-canvas)", color: "var(--text-tertiary)" }}
      >
        <span style={{ color: "var(--accent)" }}><HexMark size={30} /></span>
        <span className="t-small">{authed === false ? "Redirecting to sign in…" : "Loading…"}</span>
      </div>
    );
  }

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

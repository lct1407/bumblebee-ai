"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { WhatsNewModal } from "@/components/app/whats-new-modal";
import { getAuthToken } from "@/lib/api-client";
import { HexMark } from "@/components/ui/hex-mark";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

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
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar onCmdK={() => setCmdOpen(true)} />
      </div>

      {/* Mobile drawer backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity duration-200",
          navOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setNavOpen(false)}
        aria-hidden
      />
      {/* Mobile drawer sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-200 ease-out",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar onCmdK={() => { setNavOpen(false); setCmdOpen(true); }} />
      </div>

      <main className="flex-1 min-w-0 overflow-x-auto">
        {/* Mobile top bar */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b"
          style={{ background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)", borderColor: "var(--border)", backdropFilter: "blur(8px)" }}
        >
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="w-9 h-9 -ml-1.5 rounded-md flex items-center justify-center transition hover:bg-[var(--bg-subtle)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="inline-flex items-center gap-2 font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--accent)" }}><HexMark size={22} /></span>
            bumblebee
          </span>
          <button
            onClick={() => setCmdOpen(true)}
            aria-label="Search"
            className="ml-auto w-9 h-9 rounded-md flex items-center justify-center transition hover:bg-[var(--bg-subtle)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          </button>
        </div>

        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <WhatsNewModal />
    </div>
  );
}

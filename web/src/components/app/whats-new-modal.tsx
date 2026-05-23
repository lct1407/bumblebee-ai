"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChangelogApi, type ReleaseStanza } from "@/lib/changelog-api";

const DISMISSED_KEY = "bumblebee.whatsNew.lastSeen";

/**
 * Shows the latest CHANGELOG release once per user per version.
 * Persists "I saw version X" in localStorage; reopens automatically when a new
 * version ships.
 */
export function WhatsNewModal() {
  const { data, isLoading } = useQuery({
    queryKey: ["changelog", "latest"],
    queryFn: ChangelogApi.latest,
    staleTime: 60 * 60 * 1000, // 1h
    retry: false,
  });

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading || !data) return;
    const lastSeen = typeof window !== "undefined"
      ? window.localStorage.getItem(DISMISSED_KEY)
      : null;
    if (lastSeen !== data.version) {
      setOpen(true);
    }
  }, [isLoading, data]);

  const dismiss = () => {
    if (data) {
      window.localStorage.setItem(DISMISSED_KEY, data.version);
    }
    setOpen(false);
  };

  if (!data) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                style={{ background: "rgba(0,0,0,0.50)", backdropFilter: "blur(4px)" }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[80vh] rounded-2xl border overflow-hidden flex flex-col"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border-strong)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <header
                  className="px-5 py-4 border-b flex items-baseline justify-between"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div>
                    <Dialog.Title className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                      What's new in {data.version}
                    </Dialog.Title>
                    {data.date && (
                      <p className="t-tiny mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        Released {data.date}
                      </p>
                    )}
                  </div>
                  <Dialog.Close
                    className="w-7 h-7 rounded-md flex items-center justify-center transition hover:bg-[var(--bg-subtle)]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Dialog.Close>
                </header>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {Object.entries(data.sections).slice(0, 5).map(([section, bullets]) => (
                    <div key={section}>
                      <h3
                        className="t-overline mb-2"
                        style={{ color: section.toLowerCase().includes("break") ? "var(--status-danger)" : "var(--text-tertiary)" }}
                      >
                        {section}
                      </h3>
                      <ul className="space-y-1.5">
                        {bullets.slice(0, 8).map((b, i) => (
                          <li
                            key={i}
                            className="text-sm leading-relaxed flex items-start gap-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <span style={{ color: "var(--accent)" }}>•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                        {bullets.length > 8 && (
                          <li className="t-tiny pl-4" style={{ color: "var(--text-tertiary)" }}>
                            + {bullets.length - 8} more
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>

                <footer
                  className="px-5 py-3 border-t flex justify-end gap-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    onClick={dismiss}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Got it
                  </button>
                </footer>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: "right" | "left" | "bottom";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
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
                className="fixed inset-0 z-50 backdrop-blur-sm"
                style={{ background: "rgba(0,0,0,0.45)" }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ x: side === "right" ? "100%" : side === "left" ? "-100%" : "0" }}
                animate={{ x: 0 }}
                exit={{ x: side === "right" ? "100%" : side === "left" ? "-100%" : "0" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className={cn(
                  "fixed top-0 z-50 h-full flex flex-col border-l",
                  side === "right" ? "right-0 w-full max-w-2xl" : side === "left" ? "left-0 w-full max-w-2xl" : "bottom-0 w-full max-h-[80vh]",
                  className,
                )}
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-lg)",
                  color: "var(--text-primary)",
                }}
              >
                {title && (
                  <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <Dialog.Title className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                      {title}
                    </Dialog.Title>
                    <Dialog.Close
                      className="w-7 h-7 rounded-md flex items-center justify-center transition hover:bg-[var(--bg-subtle)]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Dialog.Close>
                  </header>
                )}
                <div className="flex-1 overflow-y-auto">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

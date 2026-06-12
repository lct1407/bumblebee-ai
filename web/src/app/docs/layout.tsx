import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/docs-source";
import "@/styles/docs.css";

/**
 * Layout for all /docs pages.
 * - No <html>/<body> here — the root app/layout.tsx provides those.
 * - RootProvider wraps just the docs subtree (search + theme context for fumadocs).
 * - Theme: next-themes manages BOTH the `dark` class (what fumadocs CSS keys on)
 *   and the `data-theme` attribute (what the app's own CSS vars key on), sharing
 *   the app's `bumblebee.theme` storage key so the toggle stays in sync app-wide.
 * - docs.css is imported here (not in globals.css) to scope fumadocs styles.
 */
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        attribute: ["class", "data-theme"],
        defaultTheme: "system",
        enableSystem: true,
        storageKey: "bumblebee.theme",
      }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: "Bumblebee Docs" }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}

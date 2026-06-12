import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/docs-source";
import "@/styles/docs.css";

/**
 * Layout for all /docs pages.
 * - No <html>/<body> here — the root app/layout.tsx provides those.
 * - RootProvider wraps just the docs subtree (search + theme context for fumadocs).
 *   next-themes is disabled so it doesn't conflict with the app's own data-theme system.
 * - docs.css is imported here (not in globals.css) to scope fumadocs styles.
 */
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: "Bumblebee Docs" }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setAuthToken, setActiveWorkspace } from "@/lib/api-client";

export const dynamic = "force-dynamic";

/**
 * OAuth callback completion landing page.
 *
 * The backend redirects here after Google OAuth with `#token=...&ws_slug=...&new=...`.
 * We read the URL fragment (never sent to server), stash the token in localStorage,
 * then redirect to /onboard (new user) or /dashboard.
 */
export default function GoogleAuthComplete() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const wsSlug = params.get("ws_slug");
    const isNew = params.get("new") === "1";

    if (!token) {
      router.replace("/login?error=oauth_no_token");
      return;
    }
    setAuthToken(token);
    if (wsSlug) setActiveWorkspace(wsSlug);
    router.replace(isNew ? "/onboard" : "/dashboard");
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg-canvas)", color: "var(--text-tertiary)" }}
    >
      <div className="text-sm">Signing you in…</div>
    </div>
  );
}

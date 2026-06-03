"use client";
import { useQuery } from "@tanstack/react-query";
import { AuthApi, getActiveWorkspace, getAuthToken, type Role } from "@/lib/api-client";

/** Current-user + role helper. Role is resolved against the active workspace. */
export function useAuth() {
  const token = typeof window !== "undefined" ? getAuthToken() : null;

  const q = useQuery({
    queryKey: ["me"],
    queryFn: AuthApi.me,
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });

  const me = q.data;
  const activeSlug = typeof window !== "undefined" ? getActiveWorkspace() : null;
  const workspaces = me?.workspaces ?? [];
  const activeWs = workspaces.find((w) => w.slug === activeSlug) ?? workspaces[0];
  const role: Role | null = activeWs?.role ?? null;
  const isAdmin = !!me?.is_admin || role === "owner" || role === "admin";

  return {
    loading: q.isLoading,
    hasToken: !!token,
    authenticated: !!token && (me?.authenticated ?? false),
    user: me,
    role,
    isAdmin,
    workspaces,
  };
}

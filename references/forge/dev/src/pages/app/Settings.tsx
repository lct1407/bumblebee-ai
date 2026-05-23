import { useAppStore } from "@/stores/app-store";
import { PageShell } from "@/components/ui/page-shell";
import { useLogout } from "@/hooks/use-logout";

export function Settings() {
  const { config } = useAppStore();
  const logout = useLogout();

  return (
    <PageShell title="Settings">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-700">
              Connected to {config.strapiUrl}
            </span>
          </div>
          <button
            onClick={logout}
            className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
          >
            Logout
          </button>
        </div>
      </div>

      <p className="mt-6 text-sm text-gray-400">
        Project settings (repo path, instructions) are configured within each project page.
      </p>
    </PageShell>
  );
}

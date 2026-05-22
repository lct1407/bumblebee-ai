import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="w-56 border-r border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 flex flex-col">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🐝 bumblebee
        </Link>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Dashboard
          </Link>
          <Link href="/issues" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Issues
          </Link>
          <Link href="/plugins" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Plugins
          </Link>
          <Link href="/notifications" className="px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Notifications
          </Link>
        </nav>
        <div className="mt-auto pt-6 text-xs text-zinc-500">
          <Link href="/" className="hover:text-amber-500">← Back to landing</Link>
          <div className="mt-2">v0.4.0</div>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-x-auto">{children}</main>
    </div>
  );
}

"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectSwitcher } from "@/components/app/project-switcher";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/issues", label: "Issues", icon: "🎯" },
  { href: "/plugins", label: "Plugins", icon: "🧩" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/help", label: "Help", icon: "📖" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <motion.span
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.5 }}
            className="text-2xl"
          >
            🐝
          </motion.span>
          <span className="font-bold tracking-tight text-zinc-900 dark:text-white">
            bumblebee
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono">
            v0.4.0
          </span>
        </Link>

        <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700" />
        <ProjectSwitcher />

        <nav className="flex items-center gap-1 flex-1 justify-center">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="opacity-70">{item.icon}</span>
                  {item.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 bg-amber-500/10 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-amber-500 transition">
            ← Landing
          </Link>
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700" />
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-amber-500/30">
            A
          </div>
        </div>
      </div>
    </header>
  );
}

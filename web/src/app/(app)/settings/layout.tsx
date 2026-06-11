"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/use-auth";

const NAV = [
  { href: "/settings/workspace", label: "Workspace", adminOnly: false },
  { href: "/settings/members", label: "Members", adminOnly: true },
  { href: "/settings/projects", label: "Projects", adminOnly: false },
  { href: "/settings/devices", label: "Devices", adminOnly: false },
  { href: "/settings/api-keys", label: "API keys", adminOnly: false },
  { href: "/settings/billing", label: "Billing", adminOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const items = NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 lg:gap-10">
      <aside>
        <h2 className="t-overline mb-3" style={{ color: "var(--text-tertiary)" }}>
          Settings
        </h2>
        <nav className="space-y-px">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative block px-2.5 py-1.5 rounded-md text-sm transition hover:bg-[var(--bg-subtle)]"
                style={{
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active && (
                  <motion.span
                    layoutId="settings-active-bar"
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                {item.label}
                {item.adminOnly && (
                  <span className="ml-1.5 text-[9px] font-mono uppercase" style={{ color: "var(--text-quaternary)" }}>
                    admin
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

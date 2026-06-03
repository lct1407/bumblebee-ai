"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectsApi, IssuesApi, getActiveProject, setActiveProject } from "@/lib/api-client";
import { Combobox } from "@/components/ui/combobox";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HexMark } from "@/components/ui/hex-mark";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

interface NavSection {
  label: string;
  items: { href: string; label: string; icon: React.ReactNode; badge?: number | string }[];
}

const Icon = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

export function Sidebar({ onCmdK }: { onCmdK: () => void }) {
  const pathname = usePathname();
  const { isAdmin, role, user } = useAuth();
  const username = user?.username || "Account";
  const [collapsed, setCollapsed] = useState(false);
  const [project, setProject] = useState("bb");
  useEffect(() => setProject(getActiveProject()), []);

  const projects = useQuery({ queryKey: ["projects"], queryFn: ProjectsApi.list });
  const issues = useQuery({
    queryKey: ["issues", project],
    queryFn: () => IssuesApi.list(project),
    enabled: !!project,
  });

  const issueStats = (issues.data ?? []).reduce(
    (acc, i) => {
      if (["new", "triaged", "planned", "approved", "in_progress", "in_review"].includes(i.status)) acc.open++;
      if (i.status === "closed") acc.closed++;
      if (i.status === "failed") acc.failed++;
      return acc;
    },
    { open: 0, closed: 0, failed: 0 },
  );

  const sections: NavSection[] = [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: <Icon d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" /> },
        { href: "/notifications", label: "Inbox", icon: <Icon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /> },
      ],
    },
    {
      label: "Project",
      items: [
        { href: "/issues", label: "All issues", icon: <Icon d="M12 22s-8-4-8-12V4l8 2 8-2v6c0 8-8 12-8 12z" />, badge: issueStats.open },
        { href: "/issues?status=in_progress", label: "Active", icon: <Icon d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />, badge: issueStats.open },
        { href: "/issues?status=closed", label: "Closed", icon: <Icon d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />, badge: issueStats.closed },
        { href: "/issues?status=failed", label: "Failed", icon: <Icon d="M15 9l-6 6M9 9l6 6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />, badge: issueStats.failed },
        { href: "/milestones", label: "Milestones", icon: <Icon d="M4 4v16M4 5h11l-2 3 2 3H4" /> },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/plugins", label: "Plugins", icon: <Icon d="M14 6V3h-4v3H5v15h14V6h-5zm0 12h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V8h4v2z" /> },
        { href: "/settings/workspace", label: "Settings", icon: <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /> },
        { href: "/help", label: "Help", icon: <Icon d="M12 22a10 10 0 100-20 10 10 0 000 20zM9 9a3 3 0 116 0c0 1.5-2 2-3 3v2M12 18h.01" /> },
      ],
    },
    ...(isAdmin
      ? [{
          label: "Admin",
          items: [
            { href: "/settings/members", label: "Members", icon: <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> },
            { href: "/settings/billing", label: "Billing", icon: <Icon d="M1 4h22v16H1zM1 10h22" /> },
            { href: "/settings/api-keys", label: "API keys", icon: <Icon d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /> },
          ] as NavSection["items"],
        }]
      : []),
  ];

  const projectOptions = (projects.data ?? []).map((p) => ({
    value: p.slug,
    label: p.name,
    hint: p.key,
  }));

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 244 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="sticky top-0 h-screen flex-shrink-0 flex flex-col overflow-hidden border-r"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Brand */}
      <div className="h-14 flex items-center px-3 border-b" style={{ borderColor: "var(--border)" }}>
        <Link href="/" className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="w-7 h-7 flex items-center justify-center flex-shrink-0"
            style={{ color: "var(--accent)" }}
          >
            <HexMark size={26} />
          </span>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 min-w-0">
              <span className="font-semibold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                Bumblebee
              </span>
              <span
                className="text-[10px] font-mono px-1 py-0.5 rounded"
                style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
              >
                0.4
              </span>
            </motion.div>
          )}
        </Link>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-7 h-7 rounded-md flex items-center justify-center transition hover:bg-[var(--bg-subtle)]"
          style={{ color: "var(--text-tertiary)" }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Workspace + Project switchers */}
      {!collapsed && (
        <div className="p-2.5 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
          <WorkspaceSwitcher />
          <Combobox
            options={projectOptions}
            value={project}
            onChange={(v: string) => {
              setActiveProject(v);
              setProject(v);
              window.location.reload();
            }}
            placeholder="Project…"
            searchPlaceholder="Search…"
            className="w-full justify-between"
          />
        </div>
      )}

      {/* Search */}
      <button
        onClick={onCmdK}
        className={cn(
          "mx-2.5 my-2 flex items-center gap-2 rounded-md text-sm transition px-2.5 py-1.5 hover:bg-[var(--bg-subtle)]",
          collapsed && "justify-center",
        )}
        style={{ color: "var(--text-tertiary)" }}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search…</span>
            <kbd
              className="text-[10px] font-mono px-1 py-0.5 rounded"
              style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}
            >
              ⌘K
            </kbd>
          </>
        )}
      </button>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-3 mt-1">
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="px-2.5 mb-1 t-overline" style={{ color: "var(--text-quaternary)" }}>
                {section.label}
              </div>
            )}
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = pathname === item.href.split("?")[0];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition hover:bg-[var(--bg-subtle)]"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
                    <span
                      className="flex-shrink-0"
                      style={{ color: isActive ? "var(--text-primary)" : "var(--text-tertiary)" }}
                    >
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge != null && Number(item.badge) > 0 && (
                          <span
                            className="text-[10px] font-semibold tabular-nums tabular-nums"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-2.5 py-2 border-t flex items-center gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 uppercase"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {username.slice(0, 1)}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{username}</div>
              {role && (
                <div className="text-[10px] font-mono uppercase tracking-wide" style={{ color: isAdmin ? "var(--accent)" : "var(--text-tertiary)" }}>
                  {role}
                </div>
              )}
            </div>
            <ThemeToggle compact />
          </>
        )}
      </div>
    </motion.aside>
  );
}

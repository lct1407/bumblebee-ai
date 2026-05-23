'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { NotificationBell } from '@/features/notification/components/notification-bell';
import { useProjects } from '@/features/project/hooks/use-projects';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/providers/auth-provider';

const PROJECT_SUB_LINKS = [
  { path: '', label: 'Overview' },
  { path: '/issues', label: 'Issues' },
  { path: '/board', label: 'Board' },
  { path: '/agent', label: 'Agent' },
  { path: '/agents', label: 'Agents' },
  { path: '/settings', label: 'Settings' },
];

interface SidebarNavProps {
  onClose: () => void;
}

export function SidebarNav({ onClose }: SidebarNavProps) {
  const pathname = usePathname();
  const { data: projectsData } = useProjects();
  const { user, logout } = useAuth();
  const { connected } = useWebSocket();
  const [projectsOpen, setProjectsOpen] = useState(true);

  const projects = projectsData?.data ?? [];

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="text-lg font-bold">
          Forge
        </Link>
        <div className="hidden md:block">
          <NotificationBell align="left" />
        </div>
        <button
          onClick={onClose}
          className="rounded p-2 text-gray-400 hover:text-gray-600 md:hidden"
          aria-label="Close menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
        <Link
          href="/dashboard"
          className={cn(
            'block rounded px-3 py-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            pathname === '/dashboard' && 'bg-gray-100 font-medium text-gray-900'
          )}
        >
          Dashboard
        </Link>

        <button
          onClick={() => setProjectsOpen(!projectsOpen)}
          className="mt-3 flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          Projects
          <span className="text-[10px]">{projectsOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {projectsOpen && (
          <div className="mt-1 space-y-0.5">
            {projects.map((p) => {
              const href = `/projects/${p.slug}`;
              const active = pathname.startsWith(href);
              return (
                <div key={p.id}>
                  <Link
                    href={href}
                    className={cn(
                      'block truncate rounded px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      active && 'font-medium text-gray-900'
                    )}
                  >
                    {p.name}
                  </Link>
                  {active && (
                    <div className="ml-3 border-l border-gray-200 pl-2">
                      {PROJECT_SUB_LINKS.map((sub) => {
                        const subHref = `${href}${sub.path}`;
                        const isSubActive = pathname === subHref;
                        return (
                          <Link
                            key={sub.path}
                            href={subHref}
                            className={cn(
                              'block rounded px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100',
                              isSubActive && 'bg-gray-100 text-gray-900 font-medium'
                            )}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {projects.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-gray-400">No projects</p>
            )}
          </div>
        )}

        <Link
          href="/settings"
          className={cn(
            'mt-3 block rounded px-3 py-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            pathname === '/settings' && 'bg-gray-100 font-medium text-gray-900'
          )}
        >
          Settings
        </Link>
      </nav>

      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm text-gray-700">{user?.username ?? 'User'}</span>
          <div className="flex items-center gap-2">
            <span
              className={cn('inline-block h-2 w-2 rounded-full', connected ? 'bg-green-500' : 'bg-amber-500')}
              title={connected ? 'Connected' : 'Reconnecting'}
            />
            <button onClick={logout} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import { Shell } from '@/components/layout/shell';
import { useProjects } from '@/features/project/hooks/use-projects';
import { useIssues } from '@/features/issue/hooks/use-issues';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { UsageDashboard } from '@/features/usage/components/usage-dashboard';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateProjectModal } from '@/features/project/components/create-project-modal';
import { useSetPageTitle } from '@/hooks/use-page-title';

export default function DashboardPage() {
  useSetPageTitle('Dashboard');
  const { data: projectsData, isLoading: loadingProjects } = useProjects();
  const { data: issuesData, isLoading: loadingIssues } = useIssues();

  const projects = projectsData?.data ?? [];
  const issues = issuesData?.data ?? [];

  const [search, setSearch] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);

  const totalIssues = issues.length;
  const openIssues = issues.filter((i) => ['open', 'reopen', 'approved', 'needs_info'].includes(i.status)).length;
  const inProgressIssues = issues.filter((i) => i.status === 'in_progress').length;
  const resolvedIssues = issues.filter((i) => i.status === 'resolved').length;
  const doneIssues = issues.filter((i) => i.status === 'confirmed').length;
  const criticalIssues = issues.filter((i) => i.priority === 'critical' && !['confirmed', 'closed'].includes(i.status)).length;
  const highIssues = issues.filter((i) => i.priority === 'high' && !['confirmed', 'closed'].includes(i.status)).length;

  const filteredIssues = useMemo(() => {
    if (!search.trim()) return issues.slice(0, 10);
    const q = search.toLowerCase();
    return issues.filter(
      (i) => i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q),
    );
  }, [issues, search]);

  const recentActivity = useMemo(() => {
    return [...issues]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [issues]);

  return (
    <Shell>
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto max-w-5xl px-2 py-3 sm:p-6">
          <h1 className="mb-6 hidden text-xl font-bold sm:text-2xl text-gray-900 md:block">Dashboard</h1>

          {/* Stats Overview */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 animate-fade-in-up">
            <StatCard label="Open" value={openIssues} sub={`${totalIssues} total`} />
            <StatCard label="In Progress" value={inProgressIssues} accent={inProgressIssues > 0 ? 'text-blue-600' : undefined} />
            <StatCard label="Resolved" value={resolvedIssues} sub="Agent completed" />
            <StatCard label="Done" value={doneIssues} accent={doneIssues > 0 ? 'text-green-600' : undefined} sub="Confirmed" />
            <StatCard label="Needs Attention" value={criticalIssues + highIssues} accent={criticalIssues + highIssues > 0 ? 'text-red-600' : undefined} sub={criticalIssues > 0 ? `${criticalIssues} critical · ${highIssues} high` : `${highIssues} high priority`} />
          </div>

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues by title or description..."
              aria-label="Search issues"
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[16px] sm:text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>

          <div className="mb-8 grid gap-6 md:grid-cols-2 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            {/* Projects */}
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
                <button
                  onClick={() => setShowCreateProject(true)}
                  className="rounded bg-gray-900 px-3 py-2 text-xs text-white hover:bg-gray-700"
                >
                  New Project
                </button>
              </div>
              {loadingProjects ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : projects.length === 0 ? (
                <EmptyState title="No projects yet." description="Click 'New Project' to get started." />
              ) : (
                <ul className="space-y-2">
                  {projects.map((p) => {
                    const projIssues = issues.filter((i) => i.project?.slug === p.slug);
                    const projOpen = projIssues.filter((i) => ['open', 'reopen', 'approved', 'needs_info'].includes(i.status)).length;
                    const projActive = projIssues.filter((i) => i.status === 'in_progress').length;
                    const projResolved = projIssues.filter((i) => i.status === 'resolved').length;
                    const projDone = projIssues.filter((i) => i.status === 'confirmed').length;

                    return (
                      <li key={p.id}>
                        <Link
                          href={`/projects/${p.slug}`}
                          className="block overflow-hidden rounded-lg border border-gray-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="truncate block font-medium text-gray-900">{p.name}</span>
                              {p.description && (
                                <p className="mt-1 text-sm text-gray-500 line-clamp-1">{p.description}</p>
                              )}
                            </div>
                            <Link
                              href={`/projects/${p.slug}/issues/new`}
                              className="shrink-0 rounded bg-gray-900 px-3 py-2 text-xs text-white hover:bg-gray-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              New Issue
                            </Link>
                          </div>
                          <div className="mt-2 flex gap-3 text-xs text-gray-400">
                            <span>{projOpen} open</span>
                            <span>{projActive} active</span>
                            <span>{projResolved} resolved</span>
                            <span>{projDone} done</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Recent Activity / Search Results */}
            <section className="min-w-0">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
                {search.trim() ? `Search Results (${filteredIssues.length})` : 'Recent Activity'}
              </h2>
              {loadingIssues ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filteredIssues.length === 0 ? (
                <EmptyState title={search.trim() ? 'No issues match your search.' : 'No recent activity.'} />
              ) : (
                <ul className="space-y-2">
                  {(search.trim() ? filteredIssues : recentActivity).map((issue) => (
                    <li key={issue.id}>
                      <Link
                        href={
                          issue.project
                            ? `/projects/${issue.project.slug}/issues/${issue.documentId}`
                            : '#'
                        }
                        className="block overflow-hidden rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-gray-900">
                            <span className="mr-1.5 font-mono text-xs text-gray-400">ISS-{issue.id}</span>
                            {issue.title}
                          </span>
                          <StatusBadge status={issue.status} />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {issue.priority !== 'none' ? `${issue.priority} priority` : 'No priority'}
                          {issue.project ? ` · ${issue.project.name}` : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Usage */}
          <UsageDashboard />

          <CreateProjectModal open={showCreateProject} onClose={() => setShowCreateProject(false)} />
        </div>
      </div>
    </Shell>
  );
}

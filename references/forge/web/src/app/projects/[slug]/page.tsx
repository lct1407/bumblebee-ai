'use client';

import { useParams } from 'next/navigation';
import { useAllIssues } from '@/features/issue/hooks/use-issues';
import { useTasks } from '@/features/task/hooks/use-tasks';
import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { relativeTime } from '@/lib/utils/relative-time';

export default function ProjectOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: issuesData } = useAllIssues(slug);
  const { data: tasksData } = useTasks(slug);

  const issues = issuesData?.data ?? [];
  const tasks = tasksData?.data ?? [];

  const open = issues.filter((i) => ['open', 'reopen'].includes(i.status)).length;
  const inProgress = issues.filter((i) => ['confirmed', 'approved', 'in_progress'].includes(i.status)).length;
  const resolved = issues.filter((i) => ['resolved', 'closed'].includes(i.status)).length;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const activeTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length;
  const runningAgents = tasks.filter((t) => t.agentStatus === 'running').length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const recentIssues = [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  return (
    <div>
      {/* Issue Stats */}
      <SectionHeading>Issues</SectionHeading>
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 animate-fade-in-up">
        <StatCard label="Open" value={open} accent="text-blue-600" />
        <StatCard label="In Progress" value={inProgress} accent="text-purple-600" />
        <StatCard label="Resolved" value={resolved} accent="text-green-600" />
      </div>

      {/* Task Stats */}
      <SectionHeading>Tasks</SectionHeading>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Active" value={activeTasks} />
        <StatCard label="Completion" value={`${completionRate}%`} />
        <StatCard label="Running Agents" value={runningAgents} accent={runningAgents > 0 ? 'text-blue-600' : undefined} />
      </div>

      {/* Quick Actions */}
      <div className="mb-6 flex flex-wrap gap-3 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <Link
          href={`/projects/${slug}/issues`}
          className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white hover:bg-gray-700"
        >
          View Issues
        </Link>
        <Link
          href={`/projects/${slug}/issues/new`}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          New Issue
        </Link>
        <Link
          href={`/projects/${slug}/board`}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Task Board
        </Link>
        <Link
          href={`/projects/${slug}/agent`}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Agent Chat
        </Link>
      </div>

      {/* Recent Activity Grid */}
      <div className="grid gap-6 md:grid-cols-2 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
        {/* Recent Issues */}
        <section className="min-w-0">
          <SectionHeading>Recent Issues</SectionHeading>
          {recentIssues.length === 0 ? (
            <p className="text-sm text-gray-500">No issues yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentIssues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={`/projects/${slug}/issues/${issue.documentId}`}
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-white p-3 transition hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-900">{issue.title}</span>
                      <StatusBadge status={issue.status} />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {issue.priority !== 'none' && `${issue.priority} · `}
                      {relativeTime(issue.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent Tasks */}
        <section className="min-w-0">
          <SectionHeading>Recent Tasks</SectionHeading>
          {recentTasks.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/projects/${slug}/board`}
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-white p-3 transition hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-900">{task.title}</span>
                      <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {task.assignee && `${task.assignee} · `}
                      {task.agentStatus === 'running' ? (
                        <span className="text-blue-600">Agent running</span>
                      ) : (
                        relativeTime(task.updatedAt)
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

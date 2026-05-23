import type { IssueStatus, IssuePriority } from '@/features/issue/types';

export const STATUS_COLORS: Record<IssueStatus, string> = {
  open: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-indigo-50 text-indigo-700',
  approved: 'bg-green-50 text-green-700',
  in_progress: 'bg-orange-50 text-orange-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-50 text-gray-500',
  reopen: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  needs_info: 'bg-purple-100 text-purple-700',
};

export const PRIORITY_COLORS: Record<IssuePriority, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
  none: 'bg-gray-50 text-gray-400',
};

export const ALL_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopen', label: 'Reopen' },
  { value: 'failed', label: 'Failed' },
  { value: 'needs_info', label: 'Needs Info' },
];

export const ALL_PRIORITIES: { value: IssuePriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

export const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const ALL_CATEGORIES: { value: string; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'task', label: 'Task' },
];

export const TASK_STATUS_COLORS: Record<string, string> = {
  done: 'bg-green-100 text-green-700',
  in_review: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  todo: 'bg-blue-100 text-blue-700',
  backlog: 'bg-gray-100 text-gray-600',
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

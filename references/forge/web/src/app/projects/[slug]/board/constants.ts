import type { IssueStatus } from '@/features/issue/types';
import type { TaskStatus } from '@/features/task/types';

export const ALL_ISSUE_COLS: { status: IssueStatus; label: string; color: string; bg: string }[] = [
  { status: 'open', label: 'Open', color: 'border-gray-400', bg: 'bg-gray-50' },
  { status: 'confirmed', label: 'Confirmed', color: 'border-blue-400', bg: 'bg-blue-50' },
  { status: 'approved', label: 'Approved', color: 'border-indigo-400', bg: 'bg-indigo-50' },
  { status: 'in_progress', label: 'In Progress', color: 'border-yellow-400', bg: 'bg-yellow-50' },
  { status: 'resolved', label: 'Resolved', color: 'border-green-400', bg: 'bg-green-50' },
  { status: 'closed', label: 'Closed', color: 'border-slate-400', bg: 'bg-slate-50' },
  { status: 'reopen', label: 'Reopen', color: 'border-amber-400', bg: 'bg-amber-50' },
  { status: 'failed', label: 'Failed', color: 'border-red-400', bg: 'bg-red-50' },
];

export const TASK_COLS: { status: TaskStatus; label: string; color: string; bg: string }[] = [
  { status: 'backlog', label: 'Backlog', color: 'border-gray-400', bg: 'bg-gray-50' },
  { status: 'todo', label: 'Todo', color: 'border-blue-400', bg: 'bg-blue-50' },
  { status: 'in_progress', label: 'In Progress', color: 'border-yellow-400', bg: 'bg-yellow-50' },
  { status: 'in_review', label: 'In Review', color: 'border-purple-400', bg: 'bg-purple-50' },
  { status: 'done', label: 'Done', color: 'border-green-400', bg: 'bg-green-50' },
];

export const DEFAULT_VISIBLE: Record<IssueStatus, boolean> = {
  open: true,
  confirmed: true,
  approved: true,
  in_progress: true,
  resolved: true,
  closed: false,
  reopen: true,
  failed: true,
  needs_info: true,
};

export const BOARD_VIEW_OPTIONS: { value: 'issues' | 'tasks'; label: string }[] = [
  { value: 'issues', label: 'Issues' },
  { value: 'tasks', label: 'Tasks' },
];

export const DRAGGABLE_CARD_CLASS =
  'cursor-grab rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing';

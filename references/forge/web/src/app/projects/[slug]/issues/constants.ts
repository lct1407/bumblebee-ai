import type { IssueStatus } from '@/features/issue/types';

export const PAGE_SIZE = 10;

export type ViewMode = 'table' | 'board';
export type SortOption = 'newest' | 'oldest' | 'priority' | 'updated';

export const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'board', label: 'Board' },
];

export const BOARD_COLUMNS: {
  key: string;
  label: string;
  statuses: IssueStatus[];
  color: string;
  bg: string;
}[] = [
  { key: 'open', label: 'Open', statuses: ['open', 'reopen', 'needs_info'], color: 'border-gray-400', bg: 'bg-gray-50' },
  { key: 'confirmed', label: 'Confirmed', statuses: ['confirmed'], color: 'border-indigo-400', bg: 'bg-indigo-50' },
  { key: 'approved', label: 'Approved', statuses: ['approved'], color: 'border-green-400', bg: 'bg-green-50' },
  { key: 'in_progress', label: 'In Progress', statuses: ['in_progress'], color: 'border-yellow-400', bg: 'bg-yellow-50' },
  { key: 'done', label: 'Done', statuses: ['resolved', 'closed'], color: 'border-emerald-400', bg: 'bg-emerald-50' },
  { key: 'failed', label: 'Failed', statuses: ['failed'], color: 'border-red-400', bg: 'bg-red-50' },
];

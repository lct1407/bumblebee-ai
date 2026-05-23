import type { IssueStatus, IssuePriority } from '@/features/issue/types';
import type { TaskStatus, AgentStatus } from '@/features/task/types';

export const STATUS_COLORS: Record<IssueStatus, { bg: string; text: string }> = {
  open: { bg: '#f3f4f6', text: '#374151' },
  confirmed: { bg: '#eef2ff', text: '#4338ca' },
  approved: { bg: '#f0fdf4', text: '#15803d' },
  in_progress: { bg: '#fff7ed', text: '#c2410c' },
  resolved: { bg: '#ecfdf5', text: '#059669' },
  closed: { bg: '#f9fafb', text: '#6b7280' },
  reopen: { bg: '#fef3c7', text: '#b45309' },
  failed: { bg: '#fee2e2', text: '#b91c1c' },
  needs_info: { bg: '#f3e8ff', text: '#7c3aed' },
};

export const PRIORITY_COLORS: Record<IssuePriority, { bg: string; text: string }> = {
  critical: { bg: '#fee2e2', text: '#b91c1c' },
  high: { bg: '#ffedd5', text: '#c2410c' },
  medium: { bg: '#fef9c3', text: '#a16207' },
  low: { bg: '#f3f4f6', text: '#4b5563' },
  none: { bg: '#f9fafb', text: '#9ca3af' },
};

export const TASK_STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  done: { bg: '#dcfce7', text: '#15803d' },
  in_review: { bg: '#f3e8ff', text: '#7c3aed' },
  in_progress: { bg: '#fef9c3', text: '#a16207' },
  todo: { bg: '#dbeafe', text: '#1d4ed8' },
  backlog: { bg: '#f3f4f6', text: '#4b5563' },
};

export const AGENT_STATUS_COLORS: Record<AgentStatus, { bg: string; text: string }> = {
  idle: { bg: '#f3f4f6', text: '#4b5563' },
  running: { bg: '#dbeafe', text: '#1d4ed8' },
  completed: { bg: '#dcfce7', text: '#15803d' },
  failed: { bg: '#fee2e2', text: '#b91c1c' },
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
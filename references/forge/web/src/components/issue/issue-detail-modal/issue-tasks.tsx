'use client';

import { cn } from '@/lib/utils/cn';
import { TASK_STATUS_COLORS } from '@/lib/constants';

interface Task {
  id: number;
  title: string;
  status: string;
}

interface IssueTasksProps {
  tasks: Task[];
}

export function IssueTasks({ tasks }: IssueTasksProps) {
  if (tasks.length === 0) return null;

  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const progress = Math.round((doneTasks / tasks.length) * 100);

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <span className="text-xs text-gray-500">{doneTasks}/{tasks.length}</span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ul className="space-y-1">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 text-sm">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', TASK_STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600')}>
              {task.status}
            </span>
            <span className={task.status === 'done' ? 'text-gray-400 line-through' : ''}>{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

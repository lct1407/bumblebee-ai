import { cn } from '@/lib/utils/cn';
import { STATUS_COLORS } from '@/lib/constants';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'bg-gray-100 text-gray-600')}>
      {status}
    </span>
  );
}

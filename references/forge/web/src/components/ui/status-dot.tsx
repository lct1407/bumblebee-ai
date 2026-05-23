import { cn } from '@/lib/utils/cn';

const STATUS_DOT_COLORS: Record<string, string> = {
  running: 'bg-green-500 animate-pulse',
  completed: 'bg-gray-400',
  failed: 'bg-red-500',
};

export function StatusDot({ status }: { status: string }) {
  const color = STATUS_DOT_COLORS[status] ?? 'bg-gray-300';
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} />;
}

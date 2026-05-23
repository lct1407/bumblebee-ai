import { cn } from '@/lib/utils/cn';

const SIZES = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-2',
};

export function Spinner({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cn('border-gray-300 border-t-gray-600 rounded-full animate-spin', SIZES[size], className)} />
  );
}

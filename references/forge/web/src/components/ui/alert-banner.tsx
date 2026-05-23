import { cn } from '@/lib/utils/cn';

const VARIANTS = {
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  error: 'border-red-200 bg-red-50 text-red-700',
};

export function AlertBanner({ variant, children }: { variant: 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <div className={cn('mb-4 rounded-lg border p-3 text-sm', VARIANTS[variant])}>
      {children}
    </div>
  );
}

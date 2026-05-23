import { cn } from '@/lib/utils/cn';
import type { LabelHTMLAttributes, ReactNode } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  hint?: ReactNode;
}

export function Label({ hint, className, children, ...props }: LabelProps) {
  return (
    <label className={cn('mb-1 block text-sm font-medium text-gray-700', className)} {...props}>
      {children}
      {hint && <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

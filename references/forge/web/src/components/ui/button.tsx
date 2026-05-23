import { cn } from '@/lib/utils/cn';
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'bg-black text-white hover:bg-gray-800 disabled:opacity-50',
  secondary: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
};

const sizes = {
  xs: 'px-3 py-2 text-xs',
  sm: 'px-3 py-2.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors', variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

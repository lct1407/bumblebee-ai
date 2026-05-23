import { cn } from '@/lib/utils/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, ...props }, ref) => (
    <label htmlFor={id} className="flex items-center gap-2">
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className={cn('h-4 w-4 rounded border-gray-300', className)}
        {...props}
      />
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
    </label>
  ),
);
Checkbox.displayName = 'Checkbox';

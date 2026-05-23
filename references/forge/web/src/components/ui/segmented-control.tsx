import { cn } from '@/lib/utils/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
            value === opt.value ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

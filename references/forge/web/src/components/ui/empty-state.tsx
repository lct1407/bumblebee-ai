import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      {icon && <div className="mb-2 flex justify-center text-gray-400">{icon}</div>}
      <p className="text-sm text-gray-500">{title}</p>
      {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
    </div>
  );
}

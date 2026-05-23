'use client';

import { Markdown } from '@/components/ui/markdown';

interface IssuePlanProps {
  plan: string;
}

export function IssuePlan({ plan }: IssuePlanProps) {
  return (
    <div className="px-4 py-3 sm:px-6">
      <h3 className="mb-1 text-sm font-semibold">Implementation Plan</h3>
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
        <Markdown className="text-sm text-gray-700">{plan}</Markdown>
      </div>
    </div>
  );
}

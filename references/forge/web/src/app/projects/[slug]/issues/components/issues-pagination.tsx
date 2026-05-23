'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface IssuesPaginationProps {
  total: number;
  pageCount: number;
  safePage: number;
  setParam: (key: string, value: string) => void;
}

export function IssuesPagination({
  total,
  pageCount,
  safePage,
  setParam,
}: IssuesPaginationProps) {
  return (
    <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-gray-400">
      <span>
        {total} issue{total !== 1 ? 's' : ''}
        {pageCount > 1 && ` — page ${safePage} of ${pageCount}`}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setParam('page', String(safePage - 1))}
            disabled={safePage <= 1}
            aria-label="Previous page"
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - safePage) <= 1)
            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === 'ellipsis' ? (
                <span key={`e${idx}`} className="px-1">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setParam('page', String(p))}
                  className={cn(
                    'min-w-[28px] rounded px-1.5 py-0.5',
                    p === safePage ? 'bg-gray-200 font-medium text-gray-700' : 'hover:bg-gray-100',
                  )}
                >
                  {p}
                </button>
              ),
            )}
          <button
            onClick={() => setParam('page', String(safePage + 1))}
            disabled={safePage >= pageCount}
            aria-label="Next page"
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

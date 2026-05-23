'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { Play, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button, Input, Select, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { ALL_STATUSES, ALL_PRIORITIES } from '@/lib/constants';
import { VIEW_OPTIONS, type ViewMode, type SortOption } from '../constants';
import type { IssueStatus, IssuePriority } from '@/features/issue/types';

interface FilterDropdownsProps {
  statusFilter: IssueStatus | 'all';
  priorityFilter: IssuePriority | 'all';
  categoryFilter: string;
  categories: string[];
  sortBy: SortOption;
  viewMode: ViewMode;
  setParam: (key: string, value: string) => void;
  className?: string;
}

function FilterDropdowns({
  statusFilter,
  priorityFilter,
  categoryFilter,
  categories,
  sortBy,
  viewMode,
  setParam,
  className,
}: FilterDropdownsProps) {
  return (
    <div className={className}>
      <Select
        value={statusFilter}
        onChange={(e) => setParam('status', e.currentTarget.value)}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </Select>
      <Select
        value={priorityFilter}
        onChange={(e) => setParam('priority', e.currentTarget.value)}
        aria-label="Filter by priority"
      >
        <option value="all">All priorities</option>
        {ALL_PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </Select>
      {categories.length > 0 && (
        <Select
          value={categoryFilter}
          onChange={(e) => setParam('category', e.currentTarget.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      )}
      {viewMode === 'table' && (
        <Select
          value={sortBy}
          onChange={(e) => setParam('sort', e.currentTarget.value)}
          aria-label="Sort issues"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="priority">Priority</option>
          <option value="updated">Recently Updated</option>
        </Select>
      )}
    </div>
  );
}

interface IssuesToolbarProps extends FilterDropdownsProps {
  slug: string;
  searchQuery: string;
  activeFilterCount: number;
  filtersOpen: boolean;
  checkedCount: number;
  desktopConnected: boolean;
  isBuildingPrompt: boolean;
  onToggleFilters: () => void;
  onStartSession: () => void;
}

export function IssuesToolbar({
  slug,
  searchQuery,
  statusFilter,
  priorityFilter,
  categoryFilter,
  categories,
  sortBy,
  viewMode,
  setParam,
  activeFilterCount,
  filtersOpen,
  checkedCount,
  desktopConnected,
  isBuildingPrompt,
  onToggleFilters,
  onStartSession,
}: IssuesToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from URL → local when searchQuery changes externally
  useEffect(() => { setLocalSearch(searchQuery); }, [searchQuery]);

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setParam('q', value), 300);
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <>
      {/* Search */}
      <div className="mb-3">
        <Input
          type="text"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search issues…"
          aria-label="Search issues"
          className="text-[16px] sm:text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      {/* Toolbar row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SegmentedControl options={VIEW_OPTIONS} value={viewMode} onChange={(v) => setParam('view', v)} />

          <button
            onClick={onToggleFilters}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm sm:hidden',
              activeFilterCount > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'text-gray-600',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>

          <FilterDropdowns
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            categoryFilter={categoryFilter}
            categories={categories}
            sortBy={sortBy}
            viewMode={viewMode}
            setParam={setParam}
            className="hidden sm:flex sm:items-center sm:gap-2"
          />
        </div>

        <div className="flex items-center gap-2">
          {desktopConnected && checkedCount > 0 && (
            <button
              onClick={onStartSession}
              disabled={isBuildingPrompt}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isBuildingPrompt ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Start Session ({checkedCount})
            </button>
          )}
          <Link href={`/projects/${slug}/issues/new`}>
            <Button>New Issue</Button>
          </Link>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <FilterDropdowns
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          categoryFilter={categoryFilter}
          categories={categories}
          sortBy={sortBy}
          viewMode={viewMode}
          setParam={setParam}
          className="mb-4 flex flex-col gap-2 rounded-lg border bg-gray-50 p-3 sm:hidden"
        />
      )}
    </>
  );
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useIssues, useAllIssues, useUpdateIssue, useEnrichIssue } from '@/features/issue/hooks/use-issues';
import { useAgentStreamContext } from '@/hooks/agent-stream-context';
import { PAGE_SIZE, type SortOption, type ViewMode } from '../constants';
import type { Issue, IssueStatus, IssuePriority } from '@/features/issue/types';

const SORT_MAP: Record<SortOption, string> = {
  newest: 'createdAt:desc',
  oldest: 'createdAt:asc',
  priority: 'priority:asc',
  updated: 'updatedAt:desc',
};

export function useIssuesPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { desktopConnected, requestBuildPrompt, isBuildingPrompt } = useAgentStreamContext();

  const statusFilter = (searchParams.get('status') ?? 'all') as IssueStatus | 'all';
  const priorityFilter = (searchParams.get('priority') ?? 'all') as IssuePriority | 'all';
  const categoryFilter = searchParams.get('category') ?? 'all';
  const sortBy = (searchParams.get('sort') ?? 'newest') as SortOption;
  const searchQuery = searchParams.get('q') ?? '';
  const currentPage = Number(searchParams.get('page') ?? '1');

  // Server-side paginated query for table view
  const { data: paginatedData, isLoading } = useIssues({
    projectSlug: slug,
    page: currentPage,
    pageSize: PAGE_SIZE,
    status: statusFilter,
    priority: priorityFilter,
    category: categoryFilter,
    search: searchQuery,
    sort: SORT_MAP[sortBy] ?? 'createdAt:desc',
  });

  // Unpaginated query for board view + categories
  const { data: allData } = useAllIssues(slug);
  const allIssues = allData?.data ?? [];

  const updateIssue = useUpdateIssue();
  const enrichIssue = useEnrichIssue();

  const issues = paginatedData?.data ?? [];
  const pagination = paginatedData?.meta?.pagination;
  const pageCount = pagination?.pageCount ?? 1;
  const total = pagination?.total ?? 0;
  const safePage = Math.min(currentPage, pageCount);

  const categories = useMemo(
    () => [...new Set(allIssues.map((i) => i.category).filter(Boolean))].sort() as string[],
    [allIssues],
  );

  const activeFilterCount = [
    statusFilter !== 'all',
    priorityFilter !== 'all',
    categoryFilter !== 'all',
  ].filter(Boolean).length;

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'all' || value === '' || value === 'newest') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      if (key !== 'page') params.delete('page');
      const qs = params.toString();
      router.replace(`/projects/${slug}/issues${qs ? `?${qs}` : ''}`);
    },
    [searchParams, router, slug],
  );

  const handleUpdate = useCallback(
    (id: string, data: Partial<Issue>) => {
      updateIssue.mutate({ id, data });
    },
    [updateIssue],
  );

  const handleBulkUpdate = useCallback(
    (data: Partial<Issue>) => {
      for (const id of checked) {
        updateIssue.mutate({ id, data });
      }
      setChecked(new Set());
    },
    [checked, updateIssue],
  );

  function toggleCheck(docId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function handleStartSession() {
    if (checked.size === 0) return;
    await requestBuildPrompt(Array.from(checked));
    setChecked(new Set());
    router.push(`/projects/${slug}/agent`);
  }

  return {
    slug,
    issues: allIssues, // for board view (all unpaginated)
    isLoading,
    enrichIssue,
    // view
    viewMode,
    setViewMode,
    // selection/modal
    selectedIssueId,
    setSelectedIssueId,
    // filters
    statusFilter,
    priorityFilter,
    categoryFilter,
    sortBy,
    searchQuery,
    categories,
    activeFilterCount,
    filtersOpen,
    setFiltersOpen,
    setParam,
    // checked
    checked,
    setChecked,
    toggleCheck,
    // pagination - server-side
    filtered: issues, // table view: server-paginated results
    paginated: issues, // same - already paginated by server
    pageCount,
    safePage,
    total,
    // handlers
    handleUpdate,
    handleBulkUpdate,
    handleStartSession,
    // agent
    desktopConnected,
    isBuildingPrompt,
    requestBuildPrompt,
  };
}

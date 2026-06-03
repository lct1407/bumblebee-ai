"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Combobox } from "@/components/ui/combobox";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { TableSkeleton, EmptyState } from "@/components/ui/skeleton";
import { ViewSwitcher, type ViewMode } from "@/components/issues/view-switcher";
import { BoardView } from "@/components/issues/board-view";
import { StatsView } from "@/components/issues/stats-view";
import { IssueForm } from "@/components/issues/issue-form";
import { IssuesApi, ProjectsApi, WorkflowApi, getActiveProject, type Issue } from "@/lib/api-client";
import { TypeIcon, StatusDot } from "@/components/ui/type-icon";
import { formatRelativeTime, cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "new", label: "New", icon: <StatusDot status="new" /> },
  { value: "triaged", label: "Triaged", icon: <StatusDot status="triaged" /> },
  { value: "planned", label: "Planned", icon: <StatusDot status="planned" /> },
  { value: "approved", label: "Approved", icon: <StatusDot status="approved" /> },
  { value: "in_progress", label: "In Progress", icon: <StatusDot status="in_progress" /> },
  { value: "in_review", label: "In Review", icon: <StatusDot status="in_review" /> },
  { value: "closed", label: "Closed", icon: <StatusDot status="closed" /> },
  { value: "failed", label: "Failed", icon: <StatusDot status="failed" /> },
  { value: "wont_fix", label: "Won't Fix", icon: <StatusDot status="wont_fix" /> },
];

const PRIO_GLYPH: Record<string, string> = { critical: "▲", high: "▴", medium: "■", low: "▾", none: "·" };
const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", icon: <span style={{ color: "var(--status-danger)", fontSize: 10 }}>{PRIO_GLYPH.critical}</span> },
  { value: "high", label: "High", icon: <span style={{ color: "var(--status-warning)", fontSize: 10 }}>{PRIO_GLYPH.high}</span> },
  { value: "medium", label: "Medium", icon: <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>{PRIO_GLYPH.medium}</span> },
  { value: "low", label: "Low", icon: <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{PRIO_GLYPH.low}</span> },
  { value: "none", label: "None", icon: <span style={{ color: "var(--text-quaternary)", fontSize: 10 }}>{PRIO_GLYPH.none}</span> },
];

const TYPE_VALUES = ["bug", "feature", "task", "story", "epic", "chore", "spike"];
const TYPE_OPTIONS = TYPE_VALUES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  icon: <span style={{ color: "var(--text-tertiary)" }}><TypeIcon type={value} size={14} /></span>,
}));

const ALL_COLUMNS = [
  { id: "key", label: "Key" },
  { id: "title", label: "Title" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "type", label: "Type" },
  { id: "assignee", label: "Assignee" },
  { id: "due_date", label: "Due" },
  { id: "complexity", label: "Complexity" },
  { id: "ai_confidence", label: "AI Conf." },
  { id: "scope_hints", label: "Scope" },
  { id: "updated_at", label: "Updated" },
];

function memberInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

function fmtDue(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function IssuesPage() {
  const [project, setProject] = useState("bb");
  useEffect(() => setProject(getActiveProject()), []);

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: true }]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_COLUMNS.map((c) => c.id));
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<ViewMode>("list");

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["issues", project],
    queryFn: () => IssuesApi.list(project),
  });

  const membersQuery = useQuery({
    queryKey: ["project-members", project],
    queryFn: () => ProjectsApi.members(project),
  });
  const memberMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const m of membersQuery.data ?? []) {
      map.set(m.user_id, { name: m.full_name || m.username || m.email || m.user_id });
    }
    return map;
  }, [membersQuery.data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((i) => {
      if (statusFilter.length && !statusFilter.includes(i.status)) return false;
      if (priorityFilter.length && !priorityFilter.includes(i.priority)) return false;
      if (typeFilter.length && !typeFilter.includes(i.type)) return false;
      if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, statusFilter, priorityFilter, typeFilter, search]);

  const columns = useMemo<ColumnDef<Issue>[]>(
    () => [
      {
        accessorKey: "number",
        id: "key",
        header: "Key",
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-[12px]" style={{ color: "var(--accent)" }}>
            {project.toUpperCase()}-{row.original.number}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedIssue(row.original); }}
            className="text-left text-[13px] font-medium transition hover:text-[var(--accent)]"
            style={{ color: "var(--text-primary)" }}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: "type",
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-tertiary)" }}><TypeIcon type={row.original.type} size={13} /></span>
            {row.original.type}
          </span>
        ),
      },
      {
        id: "assignee",
        accessorKey: "assignee_id",
        header: "Assignee",
        cell: ({ row }) => {
          const id = row.original.assignee_id;
          if (!id) return <span style={{ color: "var(--text-quaternary)" }}>—</span>;
          const name = memberMap.get(id)?.name;
          return (
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }} title={name}>
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {memberInitials(name)}
              </span>
              <span className="truncate max-w-[90px]">{name ?? "—"}</span>
            </span>
          );
        },
      },
      {
        id: "due_date",
        accessorKey: "due_date",
        header: "Due",
        cell: ({ row }) => {
          const due = fmtDue(row.original.due_date);
          if (!due) return <span style={{ color: "var(--text-quaternary)" }}>—</span>;
          const overdue =
            row.original.due_date != null &&
            new Date(row.original.due_date) < new Date() &&
            !["closed", "released"].includes(row.original.status);
          return (
            <span className="text-[12px] tabular-nums" style={{ color: overdue ? "var(--status-danger)" : "var(--text-secondary)" }}>
              {due}
            </span>
          );
        },
      },
      {
        accessorKey: "complexity",
        id: "complexity",
        header: "Complexity",
        cell: ({ row }) =>
          row.original.complexity ? (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
            >
              {row.original.complexity}
            </span>
          ) : (
            <span style={{ color: "var(--text-quaternary)" }}>—</span>
          ),
      },
      {
        accessorKey: "ai_confidence",
        id: "ai_confidence",
        header: "AI Conf.",
        cell: ({ row }) =>
          row.original.ai_confidence != null ? (
            <ConfidenceBar value={row.original.ai_confidence} />
          ) : (
            <span className="text-xs" style={{ color: "var(--text-quaternary)" }}>—</span>
          ),
      },
      {
        accessorKey: "scope_hints",
        id: "scope_hints",
        header: "Scope",
        cell: ({ row }) => {
          const hints = row.original.scope_hints ?? [];
          if (hints.length === 0) return <span style={{ color: "var(--text-quaternary)" }}>—</span>;
          return (
            <div className="flex gap-1 flex-wrap max-w-[280px]">
              {hints.slice(0, 2).map((h) => (
                <code
                  key={h}
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                >
                  {h}
                </code>
              ))}
              {hints.length > 2 && (
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  +{hints.length - 2}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "updated_at",
        id: "updated_at",
        header: "Updated",
        cell: ({ row }) => (
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
            {formatRelativeTime(row.original.updated_at)}
          </span>
        ),
      },
    ],
    [project, memberMap],
  );

  const columnVisibility = useMemo(
    () => Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, visibleColumns.includes(c.id)])),
    [visibleColumns],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const clearFilters = () => {
    setStatusFilter([]);
    setPriorityFilter([]);
    setTypeFilter([]);
    setSearch("");
  };

  const activeFilterCount = statusFilter.length + priorityFilter.length + typeFilter.length + (search ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="masthead flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Issues</h1>
            <span className="t-small tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {filtered.length} of {data?.length ?? 0}
            </span>
          </div>
          <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
            Project: <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{project}</code>
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md font-medium text-sm transition flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New issue
        </button>
      </div>

      <div
        className="flex items-center gap-2 flex-wrap rounded-lg border p-2"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <ViewSwitcher value={view} onChange={setView} />
        <div className="h-5 w-px mx-1" style={{ background: "var(--border)" }} />
        <div className="relative">
          <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--text-tertiary)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-md border bg-transparent w-44 outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </div>
        <Combobox options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} placeholder="Status" multiple />
        <Combobox options={PRIORITY_OPTIONS} value={priorityFilter} onChange={setPriorityFilter} placeholder="Priority" multiple />
        <Combobox options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} placeholder="Type" multiple />
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs px-2 transition"
            style={{ color: "var(--text-tertiary)" }}
          >
            Clear ({activeFilterCount})
          </button>
        )}

        {view === "list" && (
          <div className="ml-auto flex items-center gap-2">
            <Combobox
              options={ALL_COLUMNS.map((c) => ({ value: c.id, label: c.label }))}
              value={visibleColumns}
              onChange={setVisibleColumns}
              placeholder="Columns"
              multiple
              className="min-w-[100px]"
            />
          </div>
        )}
      </div>

      {isLoading && (
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <TableSkeleton rows={8} />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed" style={{ borderColor: "var(--border-strong)" }}>
          <EmptyState
            title={activeFilterCount > 0 ? "No issues match your filters" : "No issues yet"}
            description={activeFilterCount > 0 ? "Try clearing some filters or broadening your search." : "Create your first issue to get started with multi-agent workflows."}
            action={
              activeFilterCount > 0 ? (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Create issue
                </button>
              )
            }
          />
        </div>
      )}

      {!isLoading && filtered.length > 0 && view === "list" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border overflow-hidden"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        onClick={h.column.getToggleSortingHandler()}
                        className="px-4 py-2.5 text-left t-overline cursor-pointer select-none whitespace-nowrap"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" && "↑"}
                          {h.column.getIsSorted() === "desc" && "↓"}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b cursor-pointer transition hover:bg-[var(--bg-subtle)]"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => setSelectedIssue(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!isLoading && filtered.length > 0 && view === "board" && (
        <BoardView issues={filtered} project={project} onSelect={setSelectedIssue} />
      )}

      {!isLoading && filtered.length > 0 && view === "stats" && (
        <StatsView issues={filtered} />
      )}

      <Sheet
        open={!!selectedIssue}
        onOpenChange={(v) => !v && setSelectedIssue(null)}
        title={selectedIssue ? `${project.toUpperCase()}-${selectedIssue.number}` : ""}
      >
        {selectedIssue && (
          <IssueDetail
            issue={selectedIssue}
            project={project}
            onUpdate={(updated) => {
              setSelectedIssue(updated);
              qc.invalidateQueries({ queryKey: ["issues"] });
            }}
          />
        )}
      </Sheet>

      <Sheet open={showCreate} onOpenChange={setShowCreate} title="Create new issue">
        <CreateIssueWrapper
          project={project}
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["issues"] });
          }}
        />
      </Sheet>
    </div>
  );
}

function CreateIssueWrapper({ project, onSuccess }: { project: string; onSuccess: () => void }) {
  const create = useMutation({
    mutationFn: (payload: any) => IssuesApi.create(project, payload),
    onSuccess,
  });
  return (
    <IssueForm
      mode="create"
      submitting={create.isPending}
      onSubmit={(payload) => create.mutate(payload as any)}
    />
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.8 ? "var(--status-success)" : value > 0.5 ? "var(--status-warning)" : "var(--status-danger)";
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
        <div className="h-full rounded-full" style={{ background: color, width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>{pct}%</span>
    </div>
  );
}

function IssueDetail({ issue, project, onUpdate }: { issue: Issue; project: string; onUpdate: (i: Issue) => void }) {
  const [status, setStatus] = useState(issue.status);
  const [priority, setPriority] = useState(issue.priority);
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: (patch: Partial<Issue>) => IssuesApi.update(project, issue.number, patch),
    onSuccess: (data) => {
      onUpdate(data);
      qc.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const trigger = useMutation({
    mutationFn: () => WorkflowApi.trigger(issue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="t-overline mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>{children}</label>
  );

  return (
    <div className="p-5 space-y-5">
      <h2 className="t-h1" style={{ color: "var(--text-primary)" }}>{issue.title}</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Status</Label>
          <Combobox
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v: string) => { setStatus(v); update.mutate({ status: v }); }}
            className="w-full"
          />
        </div>
        <div>
          <Label>Priority</Label>
          <Combobox
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={(v: string) => { setPriority(v); update.mutate({ priority: v }); }}
            className="w-full"
          />
        </div>
        <div>
          <Label>Type</Label>
          <div className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--text-tertiary)" }}><TypeIcon type={issue.type} size={14} /></span>
            {issue.type}
          </div>
        </div>
        <div>
          <Label>Complexity</Label>
          <div className="text-sm" style={{ color: "var(--text-primary)" }}>{issue.complexity || "—"}</div>
        </div>
        {issue.ai_confidence != null && (
          <div className="col-span-2">
            <Label>AI Confidence</Label>
            <ConfidenceBar value={issue.ai_confidence} />
          </div>
        )}
      </div>

      <button
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="w-full py-2.5 rounded-md font-medium transition disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        {trigger.isPending ? "Triggering…" : "Trigger workflow"}
      </button>

      {issue.description && (
        <div>
          <Label>Description</Label>
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {issue.description}
          </p>
        </div>
      )}

      {issue.ai_summary && (
        <div
          className="rounded-md border p-3 relative"
          style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
        >
          <span
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r"
            style={{ background: "var(--accent)" }}
          />
          <h3 className="t-overline mb-1.5 pl-2" style={{ color: "var(--text-tertiary)" }}>
            AI summary
          </h3>
          <p className="text-sm pl-2" style={{ color: "var(--text-primary)" }}>{issue.ai_summary}</p>
        </div>
      )}

      {issue.scope_hints?.length > 0 && (
        <div>
          <Label>Scope hints</Label>
          <div className="flex flex-wrap gap-1.5">
            {issue.scope_hints.map((s) => (
              <code
                key={s}
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
              >
                {s}
              </code>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/issues/${issue.number}`}
        className="block text-center py-2 rounded-md border text-sm transition hover:bg-[var(--bg-subtle)]"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        Open full detail page →
      </Link>
    </div>
  );
}


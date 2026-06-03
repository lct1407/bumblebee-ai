"use client";
import type { Issue, Milestone, ProjectMember } from "@/lib/api-client";

const selectStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border-strong)",
  color: "var(--text-primary)",
  borderRadius: "5px",
};

function memberLabel(m: ProjectMember) {
  return m.full_name || m.username || m.email || m.user_id.slice(0, 8);
}

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10); // YYYY-MM-DD
}

/** Sidebar card: assignee, milestone, dates, estimate — drives issue PATCH. */
export function PeopleScheduleCard({
  issue,
  members,
  milestones,
  onUpdate,
  saving,
}: {
  issue: Issue;
  members: ProjectMember[];
  milestones: Milestone[];
  onUpdate: (patch: Partial<Issue>) => void;
  saving?: boolean;
}) {
  const reporter = members.find((m) => m.user_id === issue.reporter_id);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <h3 className="t-overline mb-3" style={{ color: "var(--text-tertiary)" }}>People &amp; schedule</h3>
      <div className="space-y-3">
        <Field label="Assignee">
          <select
            value={issue.assignee_id ?? ""}
            disabled={saving}
            onChange={(e) => onUpdate({ assignee_id: e.target.value || null })}
            className="w-full px-2 py-1.5 text-sm border outline-none focus:border-[var(--accent)]"
            style={selectStyle}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>
            ))}
          </select>
        </Field>

        <Field label="Reporter">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {reporter ? memberLabel(reporter) : "—"}
          </span>
        </Field>

        <Field label="Milestone">
          <select
            value={issue.milestone_id ?? ""}
            disabled={saving}
            onChange={(e) => onUpdate({ milestone_id: e.target.value || null })}
            className="w-full px-2 py-1.5 text-sm border outline-none focus:border-[var(--accent)]"
            style={selectStyle}
          >
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Due date">
          <input
            type="date"
            value={toDateInput(issue.due_date)}
            disabled={saving}
            onChange={(e) => onUpdate({ due_date: e.target.value || null })}
            className="w-full px-2 py-1.5 text-sm border outline-none focus:border-[var(--accent)]"
            style={selectStyle}
          />
        </Field>

        <Field label="Estimate (pts)">
          <input
            type="number"
            min={0}
            value={issue.estimate ?? ""}
            disabled={saving}
            onChange={(e) => onUpdate({ estimate: e.target.value === "" ? null : Number(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm border outline-none focus:border-[var(--accent)]"
            style={selectStyle}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      {children}
    </div>
  );
}

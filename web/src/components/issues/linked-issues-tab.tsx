"use client";
/**
 * Linked issues tab — shows relations (blocks/depends_on/relates_to/etc) +
 * a button to add a new one via GraphQL addIssueRelation mutation.
 */
import { useState } from "react";
import { gql } from "@/lib/graphql-client";

type RelationGroup = { kind: string; items: { issue_id: string; note: string | null; relation_id: string }[] };

interface LinkedIssuesTabProps {
  issueId: string;
  relations: RelationGroup[];
  onRefresh?: () => void;
}

const KIND_OPTIONS = ["blocks", "depends_on", "duplicates", "caused_by", "relates_to"];

const KIND_LABEL: Record<string, { label: string; emoji: string }> = {
  blocks: { label: "Blocks", emoji: "🚧" },
  blocked_by: { label: "Blocked by", emoji: "🔒" },
  depends_on: { label: "Depends on", emoji: "🔗" },
  is_depended_on_by: { label: "Required by", emoji: "📌" },
  duplicates: { label: "Duplicates", emoji: "🔁" },
  duplicated_by: { label: "Duplicated by", emoji: "🔂" },
  caused_by: { label: "Caused by", emoji: "🪓" },
  causes: { label: "Causes", emoji: "💥" },
  relates_to: { label: "Relates to", emoji: "🔄" },
};

export function LinkedIssuesTab({ issueId, relations, onRefresh }: LinkedIssuesTabProps) {
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [kind, setKind] = useState("blocks");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await gql(
        `mutation($i: RelationCreateInput!) {
          addIssueRelation(input: $i) { id kind note }
        }`,
        { i: { sourceIssueId: issueId, targetIssueId: targetId, kind, note: note || null } }
      );
      setTargetId(""); setNote(""); setAdding(false);
      onRefresh?.();
    } catch (e: any) {
      setError(e?.message || "failed");
    }
  }

  return (
    <div className="space-y-4">
      {!relations.length ? (
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          No linked issues yet.
        </div>
      ) : (
        relations.map((g) => {
          const meta = KIND_LABEL[g.kind] || { label: g.kind, emoji: "·" };
          return (
            <section key={g.kind} className="space-y-1">
              <h4 className="text-sm font-medium">
                {meta.emoji} {meta.label}
              </h4>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li key={it.relation_id}
                      className="px-3 py-2 rounded text-sm flex items-center gap-2"
                      style={{ background: "var(--bg-subtle)" }}>
                    <code className="text-xs">{it.issue_id.slice(0, 8)}</code>
                    {it.note && <span className="text-xs opacity-60">— {it.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {adding ? (
        <div className="space-y-2 p-3 rounded border" style={{ borderColor: "var(--border)" }}>
          <input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="Target issue UUID"
            className="w-full px-2 py-1 rounded border text-sm"
            style={{ borderColor: "var(--border)" }}
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full px-2 py-1 rounded border text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABEL[k].label}</option>)}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full px-2 py-1 rounded border text-sm"
            style={{ borderColor: "var(--border)" }}
          />
          {error && <p className="text-xs" style={{ color: "var(--danger, #ef4444)" }}>⚠ {error}</p>}
          <div className="flex gap-2">
            <button onClick={submit}
                    className="px-3 py-1 rounded text-sm"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
              Add
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1 rounded text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
                className="text-sm px-3 py-1.5 rounded border"
                style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
          + Add link
        </button>
      )}
    </div>
  );
}

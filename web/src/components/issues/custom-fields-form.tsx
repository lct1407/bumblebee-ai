"use client";
/**
 * Dynamic form renderer for custom_fields driven by FieldSchema.
 * Calls GraphQL setCustomFields mutation on save.
 */
import { useState } from "react";
import { gql } from "@/lib/graphql-client";

type FieldDef = {
  key: string;
  type: "string" | "text" | "integer" | "enum" | "url" | "boolean";
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  max_length?: number;
  pattern?: string;
};

interface Props {
  issueId: string;
  schema: { fields: FieldDef[] } | null;
  values: Record<string, unknown>;
  onSaved?: (newValues: Record<string, unknown>) => void;
}

export function CustomFieldsForm({ issueId, schema, values, onSaved }: Props) {
  const [state, setState] = useState<Record<string, unknown>>(values || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!schema || !schema.fields?.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
        No custom fields defined for this issue type. Define a FieldSchema to add some.
      </p>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await gql(
        `mutation($i: CustomFieldsUpdateInput!) {
          setCustomFields(input: $i) { id customFields }
        }`,
        { i: { issueId, customFields: state } }
      );
      onSaved?.(state);
    } catch (e: any) {
      setError(e?.message || "validation failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {schema.fields.map((f) => (
        <div key={f.key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
          <label className="text-sm pt-1.5" style={{ color: "var(--text-secondary)" }}>
            {f.key}
            {f.required && <span style={{ color: "var(--danger, #ef4444)" }}>*</span>}
          </label>
          <FieldInput
            def={f}
            value={state[f.key]}
            onChange={(v) => setState({ ...state, [f.key]: v })}
          />
        </div>
      ))}
      {error && (
        <p className="text-xs px-3 py-2 rounded"
           style={{ background: "var(--bg-subtle)", color: "var(--danger, #ef4444)" }}>
          ⚠ {error}
        </p>
      )}
      <div className="flex gap-2 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {saving ? "Saving…" : "Save custom fields"}
        </button>
      </div>
    </div>
  );
}

function FieldInput({ def, value, onChange }: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseStyle: React.CSSProperties = {
    background: "var(--bg-base)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };
  const cn = "w-full px-2 py-1.5 rounded border text-sm";

  if (def.type === "enum") {
    return (
      <select className={cn} style={baseStyle}
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— select —</option>
        {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (def.type === "text") {
    return (
      <textarea className={cn} style={baseStyle} rows={3}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                maxLength={def.max_length} />
    );
  }
  if (def.type === "integer") {
    return (
      <input type="number" className={cn} style={baseStyle}
             value={(value as number | undefined) ?? ""}
             onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
             min={def.min} max={def.max} />
    );
  }
  if (def.type === "boolean") {
    return (
      <input type="checkbox"
             checked={!!value}
             onChange={(e) => onChange(e.target.checked)} />
    );
  }
  return (
    <input className={cn} style={baseStyle}
           value={(value as string) ?? ""}
           onChange={(e) => onChange(e.target.value)}
           placeholder={def.pattern ? `match ${def.pattern}` : ""}
           type={def.type === "url" ? "url" : "text"} />
  );
}

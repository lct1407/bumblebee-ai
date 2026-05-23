'use client';

import { useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';

interface EditableFieldProps {
  value: string | undefined | null;
  placeholder: string;
  title: string;
  rows?: number;
  onSave: (value: string) => void;
}

export function EditableField({ value, placeholder, title, rows = 4, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
          }}
          rows={rows}
          className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-lg border bg-gray-50 p-3">
      {value ? (
        <Markdown className="text-sm text-gray-700">{value}</Markdown>
      ) : (
        <p className="text-sm text-gray-400 italic">{placeholder}</p>
      )}
      <button
        onClick={() => { setDraft(value || ''); setEditing(true); }}
        className="absolute right-1.5 top-1.5 rounded p-1 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100"
        title={title}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

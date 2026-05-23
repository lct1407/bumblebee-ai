'use client';

import { useState, useRef, useEffect } from 'react';
import { strapiMediaUrl } from '@/lib/api/client';

export interface UploadedFile {
  id: number;
  url: string;
  name: string;
}

interface Props {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  accept?: string;
  uploadFn: (file: File) => Promise<UploadedFile | null>;
}

export function FileUpload({ value, onChange, accept = 'image/*,.pdf,.txt,.md,.log,.zip', uploadFn }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const results: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const res = await uploadFn(file);
      if (res) results.push(res);
    }
    if (results.length > 0) onChange([...value, ...results]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleRemove(id: number) {
    onChange(value.filter((f) => f.id !== id));
  }

  // Listen for paste events on the parent container
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current?.closest('[data-paste-zone]') ?? containerRef.current?.parentElement;
    if (!el) return;
    function onPaste(e: Event) {
      const ce = e as ClipboardEvent;
      const items = ce.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        handleFiles(dt.files);
      }
    }
    el.addEventListener('paste', onPaste);
    return () => el.removeEventListener('paste', onPaste);
  });

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-100">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
        </svg>
        {uploading ? 'Uploading...' : 'Click or paste to attach files'}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
          className="sr-only"
        />
      </label>
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded border bg-white px-3 py-1.5 text-sm">
              {f.url && /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name) ? (
                <img src={strapiMediaUrl(f.url)} alt={f.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              )}
              <span className="flex-1 truncate text-gray-700">{f.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(f.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

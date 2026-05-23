'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Loader2 } from 'lucide-react';

interface ChatToolCallProps {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  durationMs?: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export function ChatToolCall({ name, input, result, durationMs, isStreaming, isError }: ChatToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 transition-colors rounded-lg"
      >
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
        ) : (
          <Wrench className={`h-3.5 w-3.5 shrink-0 ${isError ? 'text-red-500' : 'text-gray-500'}`} />
        )}
        <span className="font-medium text-gray-700 truncate">{name}</span>
        {durationMs != null && (
          <span className="text-gray-400 ml-auto shrink-0">{(durationMs / 1000).toFixed(1)}s</span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-200 px-3 py-2 space-y-2">
          {input && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Input</p>
              <pre className="whitespace-pre-wrap break-all text-gray-600 bg-white rounded p-2 max-h-40 overflow-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Result</p>
              <pre className={`whitespace-pre-wrap break-all rounded p-2 max-h-40 overflow-auto ${isError ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-white'}`}>
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface Session {
  sessionId: string;
  sessionKey: string; // "telegram:123456789"
  channel: string;
  displayName?: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  timestamp: number;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

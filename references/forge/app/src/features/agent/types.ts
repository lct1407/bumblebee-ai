export interface AgentSession {
  documentId: string;
  title: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: unknown[];
  claudeSessionId?: string;
  repoPath?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

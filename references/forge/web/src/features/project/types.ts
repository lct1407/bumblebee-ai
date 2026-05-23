import type { BaseEntity } from '@/lib/types';

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

export interface Project extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  apiKey: string | null;
  defaultProvider: AIProvider;
  agentProvider: AIProvider | null;
  agentPrompt: string | null;
  agentMemoryEnabled: boolean;
  coolifyUrl: string | null;
  coolifyApiKey: string | null;
  coolifyResources: { name: string; uuid: string }[];
  sentryProject: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookStatuses: string[];
}

export interface ProjectFormData {
  name: string;
  slug: string;
  description: string;
}

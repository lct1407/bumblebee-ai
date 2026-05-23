import type { BaseEntity } from '@/lib/types';

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

export interface Project extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  defaultProvider: AIProvider;
}

export interface ProjectFormData {
  name: string;
  slug: string;
  description: string;
}

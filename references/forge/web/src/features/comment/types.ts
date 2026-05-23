import type { BaseEntity } from '@/lib/types';

export interface Comment extends BaseEntity {
  body: string;
  author: string;
  isAI: boolean;
  issue: { id: number; documentId: string } | null;
}

export interface CommentFormData {
  body: string;
  author?: string;
  issue: string; // documentId
}

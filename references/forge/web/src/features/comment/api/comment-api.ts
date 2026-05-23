import { apiClient } from '@/lib/api/client';
import type { Comment, CommentFormData } from '../types';

export const commentApi = {
  getByIssue: (issueDocumentId: string) =>
    apiClient<{ data: Comment[] }>(
      `/comments?filters[issue][documentId][$eq]=${issueDocumentId}&populate=*`
    ),

  create: (data: CommentFormData) =>
    apiClient<{ data: Comment }>('/comments', {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
};

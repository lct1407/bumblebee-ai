import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentApi } from '../api/comment-api';
import type { CommentFormData } from '../types';

export function useComments(issueDocumentId: string) {
  return useQuery({
    queryKey: ['comments', issueDocumentId],
    queryFn: () => commentApi.getByIssue(issueDocumentId),
    enabled: !!issueDocumentId,
  });
}

export function useCreateComment(issueDocumentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CommentFormData) => commentApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', issueDocumentId] });
    },
  });
}

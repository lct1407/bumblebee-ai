import { apiClient, apiUpload } from '@/lib/api/client';
import type { Issue, IssueFormData } from '../types';

export interface IssueListParams {
  projectSlug?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  sort?: string; // e.g. "createdAt:desc", "priority:asc", "updatedAt:desc"
}

export interface IssueListResponse {
  data: Issue[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export const issueApi = {
  getAll: (params: IssueListParams = {}) => {
    const qs = new URLSearchParams();
    qs.set('populate', '*');
    qs.set('pagination[page]', String(params.page ?? 1));
    qs.set('pagination[pageSize]', String(params.pageSize ?? 10));
    if (params.projectSlug) qs.set('filters[project][slug][$eq]', params.projectSlug);
    if (params.status && params.status !== 'all') qs.set('filters[status][$eq]', params.status);
    if (params.priority && params.priority !== 'all') qs.set('filters[priority][$eq]', params.priority);
    if (params.category && params.category !== 'all') qs.set('filters[category][$eq]', params.category);
    if (params.search) qs.set('filters[title][$containsi]', params.search);
    if (params.sort) qs.set('sort', params.sort);
    else qs.set('sort', 'createdAt:desc');
    return apiClient<IssueListResponse>(`/issues?${qs.toString()}`);
  },

  getAllUnpaginated: (projectSlug?: string) => {
    const filter = projectSlug
      ? `?filters[project][slug][$eq]=${projectSlug}&populate=*&pagination[pageSize]=9999`
      : '?populate=*&pagination[pageSize]=9999';
    return apiClient<{ data: Issue[] }>(`/issues${filter}`);
  },

  getById: (id: string) =>
    apiClient<{ data: Issue }>(`/issues/${id}?populate=*`),

  create: (data: IssueFormData) =>
    apiClient<{ data: Issue }>('/issues', {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  update: (id: string, data: Partial<Issue>) =>
    apiClient<{ data: Issue }>(`/issues/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    }),

  uploadImage: async (issueDocumentId: string, file: File) => {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('ref', 'api::issue.issue');
    formData.append('refId', issueDocumentId);
    formData.append('field', 'attachments');
    return apiUpload(formData);
  },

  uploadFile: async (file: File): Promise<{ id: number; url: string; name: string } | null> => {
    const formData = new FormData();
    formData.append('files', file);
    try {
      const data = await apiUpload(formData);
      if (data[0]?.id) return { id: data[0].id, url: data[0].url, name: file.name };
      return null;
    } catch {
      return null;
    }
  },

  enrich: (id: string) =>
    apiClient<{ data: { documentId: string; status: string } }>(`/issues/${id}/enrich`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    apiClient(`/issues/${id}`, { method: 'DELETE' }),
};

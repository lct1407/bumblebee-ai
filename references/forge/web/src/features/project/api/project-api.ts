import { apiClient } from '@/lib/api/client';
import type { Project } from '../types';

export const projectApi = {
  getAll: () =>
    apiClient<{ data: Project[] }>('/projects?populate=*'),

  getBySlug: (slug: string) =>
    apiClient<{ data: Project[] }>(
      `/projects?filters[slug][$eq]=${slug}&populate=*`
    ).then((res) => ({ data: res.data[0] ?? null })),

  getById: (id: string) =>
    apiClient<{ data: Project }>(`/projects/${id}?populate=*`),

  create: (data: { name: string; slug: string; description?: string }) =>
    apiClient<{ data: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  update: (id: string, data: Partial<Omit<Project, 'id' | 'slug'>>) =>
    apiClient<{ data: Project }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    }),
};

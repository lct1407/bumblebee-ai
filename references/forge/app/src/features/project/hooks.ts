import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Project } from './types';

const projectApi = {
  getAll: () =>
    apiClient<{ data: Project[] }>('/projects?populate=*'),

  getBySlug: (slug: string) =>
    apiClient<{ data: Project[] }>(
      `/projects?filters[slug][$eq]=${slug}&populate=*`,
    ).then((res) => ({ data: res.data[0] ?? null })),

  getById: (id: string) =>
    apiClient<{ data: Project }>(`/projects/${id}?populate=*`),
};

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: projectApi.getAll,
  });
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: ['projects', slug],
    queryFn: () => projectApi.getBySlug(slug),
    enabled: !!slug,
  });
}

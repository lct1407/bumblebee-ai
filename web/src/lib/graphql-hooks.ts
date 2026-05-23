/**
 * React Query hooks built on top of the bumblebee GraphQL client.
 * Replaces ad-hoc fetch + REST calls. Drop into components like:
 *
 *   const { data, isLoading } = useMe();
 *   const create = useCreateIssue();
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  gql,
  gqlKeys,
  M_APPROVE_ISSUE,
  M_CREATE_CHECKOUT,
  M_CREATE_ISSUE,
  M_DEVICE_PAIR_CONFIRM,
  M_LOGIN,
  M_SIGNUP,
  Q_ISSUES,
  Q_ME,
  Q_NODES,
  Q_PROJECTS,
} from "./graphql-client";

// ---- Types (shape mirrors the schema) ----

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  paymentOverdue: boolean;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  key: string;
  description: string | null;
  repoPath: string | null;
  baseBranch: string;
  stagingBranch: string;
  enabled: boolean;
};

export type IssueRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  complexity: string | null;
  aiSummary: string | null;
  createdAt: string;
};

export type NodeRow = {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  platform: string | null;
  hostname: string | null;
  lastHeartbeatAt: string | null;
};

// ---- Queries ----

export function useMe(): UseQueryResult<Workspace | null> {
  return useQuery({
    queryKey: gqlKeys.me(),
    queryFn: async () => (await gql<{ me: Workspace | null }>(Q_ME)).me,
  });
}

export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: gqlKeys.projects(),
    queryFn: async () =>
      (await gql<{ projects: Project[] }>(Q_PROJECTS)).projects,
  });
}

export function useIssues(
  projectId?: string,
  status?: string,
  limit = 50,
): UseQueryResult<IssueRow[]> {
  return useQuery({
    queryKey: gqlKeys.issues(projectId, status),
    queryFn: async () =>
      (
        await gql<{ issues: IssueRow[] }>(Q_ISSUES, {
          projectId,
          status,
          limit,
        })
      ).issues,
    enabled: projectId !== undefined,
  });
}

export function useNodes(): UseQueryResult<NodeRow[]> {
  return useQuery({
    queryKey: gqlKeys.nodes(),
    queryFn: async () => (await gql<{ nodes: NodeRow[] }>(Q_NODES)).nodes,
  });
}

// ---- Mutations ----

export function useLogin(): UseMutationResult<
  {
    accessToken: string;
    user: { id: string; username: string; email: string; fullName: string | null };
    workspace: { id: string; name: string; slug: string; plan: string; role: string } | null;
  },
  Error,
  { username: string; password: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (await gql<{ login: any }>(M_LOGIN, { input })).login,
    onSuccess: (data) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("bumblebee.token", data.accessToken);
      }
      qc.invalidateQueries({ queryKey: ["gql"] });
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      username: string;
      password: string;
      fullName?: string;
      workspaceName?: string;
    }) => (await gql<{ signup: any }>(M_SIGNUP, { input })).signup,
    onSuccess: (data) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("bumblebee.token", data.accessToken);
      }
      qc.invalidateQueries({ queryKey: ["gql"] });
    },
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      title: string;
      description?: string;
      type?: string;
      priority?: string;
      parentId?: string;
    }) =>
      (await gql<{ createIssue: IssueRow }>(M_CREATE_ISSUE, { input }))
        .createIssue,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gql", "issues"] }),
  });
}

export function useApproveIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await gql<{ approveIssue: IssueRow }>(M_APPROVE_ISSUE, { id }))
        .approveIssue,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gql", "issues"] }),
  });
}

export function useDevicePairConfirm() {
  return useMutation({
    mutationFn: async (code: string) =>
      (
        await gql<{
          devicePairConfirm: { nodeId: string; name: string; nodeToken: string };
        }>(M_DEVICE_PAIR_CONFIRM, { code })
      ).devicePairConfirm,
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async (input: { workspaceId: string; plan: string; seats?: number }) =>
      (
        await gql<{ createCheckoutSession: { sessionId: string; url: string } }>(
          M_CREATE_CHECKOUT,
          { input: { ...input, seats: input.seats ?? 1 } },
        )
      ).createCheckoutSession,
  });
}

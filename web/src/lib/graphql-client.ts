/**
 * Bumblebee GraphQL client. Coexists with REST api-client during migration.
 *
 * Usage:
 *   const data = await gql<{ me: { name: string } }>(
 *     `{ me { name slug plan } }`
 *   );
 *
 * Auth: reads `bumblebee.token` from localStorage (set by api-client login).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "bumblebee.token";
const WORKSPACE_KEY = "bumblebee.activeWorkspace";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function getWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export class GraphQLError extends Error {
  constructor(public errors: Array<{ message: string; path?: string[] }>) {
    super(errors.map((e) => e.message).join("; "));
  }
}

export async function gql<TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  init?: RequestInit
): Promise<TData> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Scope to the active workspace (last-used selection), matching the REST client.
  const ws = getWorkspace();
  if (ws && !headers["X-Workspace"]) headers["X-Workspace"] = ws;

  const r = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
    ...init,
  });
  if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as {
    data?: TData;
    errors?: Array<{ message: string; path?: string[] }>;
  };
  if (body.errors?.length) throw new GraphQLError(body.errors);
  return body.data as TData;
}

/** React Query helpers — pair with @tanstack/react-query already in the bundle. */
export const gqlKeys = {
  me: () => ["gql", "me"] as const,
  projects: () => ["gql", "projects"] as const,
  project: (id: string) => ["gql", "project", id] as const,
  issues: (projectId?: string, status?: string) =>
    ["gql", "issues", projectId, status] as const,
  issue: (id: string) => ["gql", "issue", id] as const,
  events: (issueId?: string) => ["gql", "events", issueId] as const,
  nodes: () => ["gql", "nodes"] as const,
};

// ---- Operations (re-usable strings) ----

export const Q_ME = `query Me {
  me { id name slug plan paymentOverdue }
}`;

export const Q_PROJECTS = `query Projects {
  projects { id name slug key description repoPath baseBranch stagingBranch enabled }
}`;

export const Q_ISSUES = `query Issues($projectId: UUID, $status: String, $limit: Int) {
  issues(projectId: $projectId, status: $status, limit: $limit) {
    id number title status priority complexity aiSummary createdAt
  }
}`;

export const Q_NODES = `query Nodes {
  nodes { id name status capabilities platform hostname lastHeartbeatAt }
}`;

export const M_CREATE_ISSUE = `mutation CreateIssue($input: IssueCreateInput!) {
  createIssue(input: $input) { id number title status }
}`;

export const M_APPROVE_ISSUE = `mutation ApproveIssue($id: UUID!) {
  approveIssue(id: $id) { id status }
}`;

export const M_LOGIN = `mutation Login($input: LoginInput!) {
  login(input: $input) {
    accessToken
    user { id username email fullName }
    workspace { id name slug plan role }
  }
}`;

export const M_SIGNUP = `mutation Signup($input: SignupInput!) {
  signup(input: $input) {
    accessToken
    user { id username email fullName }
    workspace { id name slug plan role }
  }
}`;

export const M_DEVICE_PAIR_CONFIRM = `mutation DevicePairConfirm($code: String!) {
  devicePairConfirm(code: $code) { nodeId name nodeToken }
}`;

export const M_CREATE_CHECKOUT = `mutation CreateCheckoutSession($input: CheckoutSessionInput!) {
  createCheckoutSession(input: $input) { sessionId url }
}`;

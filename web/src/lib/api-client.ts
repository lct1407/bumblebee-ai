/** Bumblebee v3 REST client with project switcher support. */
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

const PROJECT_KEY = "bumblebee.activeProject";
const WORKSPACE_KEY = "bumblebee.activeWorkspace";
const TOKEN_KEY = "bumblebee.token";

export function getActiveProject(): string {
  if (typeof window === "undefined") return "bb";
  return window.localStorage.getItem(PROJECT_KEY) || "bb";
}

export function setActiveProject(slug: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROJECT_KEY, slug);
    window.dispatchEvent(new CustomEvent("bumblebee:project-changed", { detail: slug }));
  }
}

export function getActiveWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export function setActiveWorkspace(slug: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_KEY, slug);
    window.dispatchEvent(new CustomEvent("bumblebee:workspace-changed", { detail: slug }));
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window !== "undefined") {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  }
}

// Wire JWT into axios headers when set
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && !config.headers["Authorization"]) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "team";
  role: "owner" | "admin" | "member" | "viewer";
  created_at?: string;
}

export interface Member {
  user_id: string;
  username: string | null;
  email: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
}

export const WorkspacesApi = {
  listMine: () => api.get<Workspace[]>("/api/workspaces").then((r) => r.data),
  create: (name: string, slug?: string) =>
    api.post<Workspace>("/api/workspaces", { name, slug }).then((r) => r.data),
  get: (id: string) => api.get<Workspace>(`/api/workspaces/${id}`).then((r) => r.data),
  update: (id: string, patch: { name?: string; settings?: any }) =>
    api.patch(`/api/workspaces/${id}`, patch).then((r) => r.data),
  remove: (id: string) => api.delete(`/api/workspaces/${id}`).then((r) => r.data),
  listMembers: (id: string) =>
    api.get<Member[]>(`/api/workspaces/${id}/members`).then((r) => r.data),
  updateMemberRole: (id: string, userId: string, role: Member["role"]) =>
    api.patch(`/api/workspaces/${id}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/api/workspaces/${id}/members/${userId}`).then((r) => r.data),
  invite: (id: string, email: string, role: Member["role"] = "member") =>
    api.post(`/api/workspaces/${id}/invites`, { email, role }).then((r) => r.data),
  previewInvite: (token: string) =>
    api.get(`/api/invites/${token}`).then((r) => r.data),
  acceptInvite: (token: string) =>
    api.post(`/api/invites/${token}/accept`).then((r) => r.data),
};

export interface Issue {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  type: string;
  complexity?: string | null;
  ai_confidence?: number | null;
  ai_summary?: string | null;
  scope_hints: string[];
  project_id: string;
  parent_id?: string | null;
  // Collaboration + progress
  assignee_id?: string | null;
  reporter_id?: string | null;
  milestone_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimate?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  user_id: string;
  username: string | null;
  email: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role: "owner" | "admin" | "member" | "viewer";
}

export interface Milestone {
  id: string;
  name: string;
  description?: string | null;
  status: "planned" | "active" | "completed" | "cancelled";
  start_date?: string | null;
  due_date?: string | null;
  project_id: string;
  total_issues: number;
  done_issues: number;
  progress_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  body: string;
  type: string;
  author: string | null;
  author_user_id: string | null;
  issue_id: string;
  created_at: string;
}

export interface AgentEvent {
  id: string;
  type: string;
  payload: Record<string, any>;
  source: string;
  actor?: string | null;
  occurred_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  key: string;
  description: string | null;
  default_provider?: string;
  base_branch?: string;
}

export interface WorkflowRun {
  workflow_run_id: string;
  workflow_name: string;
  status: string;
}

export const ProjectsApi = {
  list: () => api.get<Project[]>("/api/projects").then((r) => r.data),
  members: (slug: string) =>
    api.get<ProjectMember[]>(`/api/projects/${slug}/members`).then((r) => r.data),
};

export const MilestonesApi = {
  list: (slug: string) =>
    api.get<Milestone[]>(`/api/projects/${slug}/milestones`).then((r) => r.data),
  create: (slug: string, body: Partial<Milestone>) =>
    api.post<Milestone>(`/api/projects/${slug}/milestones`, body).then((r) => r.data),
  update: (slug: string, id: string, body: Partial<Milestone>) =>
    api.patch<Milestone>(`/api/projects/${slug}/milestones/${id}`, body).then((r) => r.data),
  remove: (slug: string, id: string) =>
    api.delete(`/api/projects/${slug}/milestones/${id}`).then((r) => r.data),
};

export const CommentsApi = {
  list: (slug: string, number: number) =>
    api.get<Comment[]>(`/api/projects/${slug}/issues/${number}/comments`).then((r) => r.data),
  create: (slug: string, number: number, body: { body: string; author?: string; author_user_id?: string }) =>
    api.post<Comment>(`/api/projects/${slug}/issues/${number}/comments`, body).then((r) => r.data),
};

export const IssuesApi = {
  list: (slug: string, status?: string) => {
    const url = `/api/projects/${slug}/issues${status ? `?status=${status}` : ""}`;
    return api.get<Issue[]>(url).then((r) => r.data);
  },
  get: (slug: string, number: number) =>
    api.get<Issue>(`/api/projects/${slug}/issues/${number}`).then((r) => r.data),
  create: (slug: string, body: Partial<Issue>) =>
    api.post<Issue>(`/api/projects/${slug}/issues`, body).then((r) => r.data),
  update: (slug: string, number: number, body: Partial<Issue>) =>
    api.patch<Issue>(`/api/projects/${slug}/issues/${number}`, body).then((r) => r.data),
};

export const EventsApi = {
  forIssue: (issueId: string, limit = 50) =>
    api.get<AgentEvent[]>(`/api/events?issue_id=${issueId}&limit=${limit}`).then((r) => r.data),
  recent: (limit = 30) =>
    api.get<AgentEvent[]>(`/api/events?limit=${limit}`).then((r) => r.data),
};

export const WorkflowApi = {
  trigger: (issueId: string, workflowName?: string) =>
    api
      .post<WorkflowRun>("/api/workflow-runs/trigger", {
        issue_id: issueId,
        workflow_name: workflowName,
      })
      .then((r) => r.data),
};

export const PluginsApi = {
  list: () => api.get("/api/plugins").then((r) => r.data),
  reload: () => api.post("/api/plugins/reload").then((r) => r.data),
};

export const NotificationsApi = {
  list: (params: { unread_only?: boolean; recipient?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.unread_only) qs.set("unread_only", "true");
    if (params.recipient) qs.set("recipient", params.recipient);
    return api.get(`/api/notifications?${qs}`).then((r) => r.data);
  },
  markRead: (id: string) => api.patch(`/api/notifications/${id}/read`).then((r) => r.data),
};

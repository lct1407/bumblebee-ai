/** Bumblebee v3 REST client. */
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

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
  created_at: string;
  updated_at: string;
}

export interface AgentEvent {
  id: string;
  type: string;
  payload: Record<string, any>;
  source: string;
  actor?: string | null;
  occurred_at: string;
}

export interface WorkflowRun {
  workflow_run_id: string;
  workflow_name: string;
  status: string;
}

export const ProjectsApi = {
  list: () => api.get("/api/projects").then((r) => r.data),
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
};

export const EventsApi = {
  forIssue: (issueId: string, limit = 50) =>
    api.get<AgentEvent[]>(`/api/events?issue_id=${issueId}&limit=${limit}`).then((r) => r.data),
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
};

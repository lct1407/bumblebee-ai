import type { Project, Issue, Task, Comment, IssueFormData, ChatSession, ChatSessionDetail, UsageSummary, UsageRecordInput, Agent, Notification, RemoteSkill, RemoteSkillFull } from "./types";

let baseUrl = "http://localhost:1337";
let authToken = "";

export function configureApi(url: string, token: string) {
  baseUrl = url.replace(/\/$/, "");
  authToken = token;
}

/** Resolve a Strapi media URL — returns absolute URL for both relative and absolute inputs. */
export function strapiMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${baseUrl}${url}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data ?? json;
}

// --- Projects ---

export async function getProjects(): Promise<Project[]> {
  return request("/projects?populate=*");
}

export async function getProject(slug: string): Promise<Project> {
  return request(`/projects?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=*`).then(
    (data: unknown) => (data as Project[])[0],
  );
}

// --- Issues ---

export async function getAllIssues(): Promise<Issue[]> {
  return request("/issues?populate=*&sort=updatedAt:desc&pagination[pageSize]=100");
}

export async function getIssues(
  projectSlug: string,
  status?: string,
): Promise<Issue[]> {
  let path = `/issues?filters[project][slug][$eq]=${encodeURIComponent(projectSlug)}&populate=*&sort=createdAt:desc&pagination[pageSize]=200`;
  if (status) path += `&filters[status][$eq]=${encodeURIComponent(status)}`;
  return request(path);
}

export async function getIssue(documentId: string): Promise<Issue> {
  return request(`/issues/${documentId}?populate=*`);
}

export async function createIssue(data: IssueFormData): Promise<Issue> {
  return request("/issues", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function updateIssue(
  documentId: string,
  data: Partial<Issue>,
): Promise<Issue> {
  return request(`/issues/${documentId}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

export async function enrichIssue(documentId: string): Promise<void> {
  await request(`/issues/${documentId}/enrich`, { method: "POST" });
}

// --- Tasks ---

export async function getAllTasks(): Promise<Task[]> {
  return request("/tasks?populate=*&sort=createdAt:desc&pagination[pageSize]=200");
}

export async function getTasks(projectSlug: string): Promise<Task[]> {
  return request(
    `/tasks?filters[issue][project][slug][$eq]=${encodeURIComponent(projectSlug)}&populate=*&sort=createdAt:asc`,
  );
}

export async function updateTask(
  documentId: string,
  data: Partial<Task>,
): Promise<Task> {
  return request(`/tasks/${documentId}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

// --- Comments ---

export async function getComments(issueDocId: string): Promise<Comment[]> {
  return request(`/comments?filters[issue][documentId][$eq]=${encodeURIComponent(issueDocId)}&sort=createdAt:asc`);
}

export async function createComment(data: { body: string; issue: string }): Promise<Comment> {
  return request("/comments", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

// --- Chat Sessions ---

export async function getChatSessions(projectSlug: string): Promise<ChatSession[]> {
  return request(
    `/chat-sessions?filters[project][slug][$eq]=${encodeURIComponent(projectSlug)}&sort=updatedAt:desc&pagination[pageSize]=50`,
  );
}

export async function getChatSession(documentId: string): Promise<ChatSessionDetail> {
  return request(`/chat-sessions/${documentId}`);
}

export async function sendChatMessage(
  projectSlug: string,
  message: string,
  sessionId: string | null,
): Promise<{ sessionId: string; reply: string; toolCalls?: { name: string; input: any; durationMs?: number; isError?: boolean }[] }> {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ projectSlug, message, sessionId }),
  });
}

// --- Usage ---

export async function getUsageSummary(days = 7): Promise<UsageSummary> {
  return request(`/usage-records/summary?days=${days}`);
}

export async function createUsageRecord(data: UsageRecordInput): Promise<unknown> {
  return request("/usage-records", {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function ingestCliUsage(): Promise<{ ingested: number; scanned: number }> {
  return request("/usage-records/ingest-cli", { method: "POST" });
}

// --- Agent Sessions (desktop) ---

export async function startAgentSession(
  projectSlug: string,
  promptOrType: string,
  repoPath?: string,
  issueIds?: string[],
  asType?: boolean,
): Promise<{ documentId: string }> {
  const body: any = { projectSlug, repoPath, origin: "desktop", issueIds };
  if (asType) {
    body.type = promptOrType;
  } else {
    body.prompt = promptOrType;
  }
  return request("/agent-sessions/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function sendAgentSession(
  sessionId: string,
  message: string,
  claudeSessionId?: string | null,
): Promise<void> {
  await request("/agent-sessions/send", {
    method: "POST",
    body: JSON.stringify({ sessionId, message, claudeSessionId, origin: "desktop" }),
  });
}

export async function registerDesktop(): Promise<void> {
  await request("/agent-sessions/desktop/register", { method: "POST" });
}

export async function unregisterDesktop(): Promise<void> {
  await request("/agent-sessions/desktop/unregister", { method: "POST" });
}

export async function relayAgentEvent(
  sessionId: string,
  event: string,
  data: unknown,
): Promise<void> {
  await request(`/agent-sessions/${sessionId}/relay`, {
    method: "POST",
    body: JSON.stringify({ event, data }),
  });
}

export async function relayPromptBuilt(
  requestId: string,
  prompt: string,
  error?: string,
): Promise<void> {
  await request("/agent-sessions/prompt-built", {
    method: "POST",
    body: JSON.stringify({ requestId, prompt: prompt || undefined, error }),
  });
}

// --- Agents ---

export async function getAgents(projectSlug: string): Promise<Agent[]> {
  return request(`/agents?filters[project][slug][$eq]=${encodeURIComponent(projectSlug)}`);
}

export async function updateAgent(documentId: string, data: Partial<Agent>): Promise<Agent> {
  return request(`/agents/${documentId}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}

// --- Upload ---

export async function uploadFile(file: File): Promise<{ id: number; url: string; name: string } | null> {
  const formData = new FormData();
  formData.append("files", file);
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: formData,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data[0]?.id) return { id: data[0].id, url: data[0].url, name: file.name };
  return null;
}

// --- Notifications ---

export async function getNotifications(): Promise<Notification[]> {
  return request("/notifications?sort=createdAt:desc&pagination[pageSize]=50");
}

export async function getUnreadCount(): Promise<number> {
  const result = await request<{ count: number }>("/notifications/unread-count");
  return result.count;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return request(`/notifications/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data: { read: true } }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request("/notifications/mark-all-read", { method: "POST" });
}

// --- Skills ---

export async function getRemoteSkills(projectSlug?: string): Promise<RemoteSkill[]> {
  let path = "/skills?";
  if (projectSlug) {
    path += `filters[$or][0][project][slug][$eq]=${encodeURIComponent(projectSlug)}&filters[$or][1][isGlobal][$eq]=true&`;
  }
  path += "sort=name:asc&pagination[pageSize]=100";
  return request(path);
}

export async function getRemoteSkill(documentId: string): Promise<RemoteSkillFull> {
  return request(`/skills/${documentId}`);
}

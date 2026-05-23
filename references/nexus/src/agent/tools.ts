import { exec } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface ToolContext {
  workingDir: string;
  signal: AbortSignal;
  sessionKey: string;
  onProgress?: (text: string) => void;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

function execAsync(
  command: string,
  opts: { cwd?: string; timeout?: number; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      cwd: opts.cwd,
      timeout: opts.timeout,
      maxBuffer: 1024 * 1024 * 10,
      signal: opts.signal,
    }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(error);
      } else {
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    });
  });
}

export const bashTool: AgentTool = {
  name: "bash",
  description: "Execute a shell command and return stdout+stderr",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      timeout: { type: "number", description: "Timeout in seconds (default 120)" },
    },
    required: ["command"],
  },
  async execute(input, ctx) {
    const command = input.command as string;
    const timeout = ((input.timeout as number) ?? 120) * 1000;
    const result = await execAsync(command, {
      cwd: ctx.workingDir,
      timeout,
      signal: ctx.signal,
    });
    const output = (result.stdout + result.stderr).trim();
    return output || "(no output)";
  },
};

export const fileReadTool: AgentTool = {
  name: "file_read",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative file path" },
    },
    required: ["path"],
  },
  async execute(input) {
    const path = input.path as string;
    const content = await readFile(path, "utf-8");
    return content;
  },
};

export const fileWriteTool: AgentTool = {
  name: "file_write",
  description: "Write content to a file (creates directories if needed)",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative file path" },
      content: { type: "string", description: "File content to write" },
    },
    required: ["path", "content"],
  },
  async execute(input) {
    const path = input.path as string;
    const content = input.content as string;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return "OK";
  },
};

export const webFetchTool: AgentTool = {
  name: "web_fetch",
  description: "Fetch the content of a URL",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
    },
    required: ["url"],
  },
  async execute(input, ctx) {
    const url = input.url as string;
    const res = await fetch(url, { signal: ctx.signal });
    const text = await res.text();
    return text.slice(0, 50000);
  },
};

export function createStrapiApiTool(baseUrl: string): AgentTool {
  return {
    name: "strapi_api",
    description: "Query the SID-HRM Strapi API. Use this to read or write HR data: employees, leave requests, attendance, payroll, departments, positions, etc. The request is made with the current user's JWT so it respects their tenant and permissions.",
    parameters: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "HTTP method",
        },
        endpoint: {
          type: "string",
          description: "API endpoint path (e.g. /employees, /leave-requests?filters[status][$eq]=pending&populate=employee)",
        },
        body: {
          type: "object",
          description: "Request body for POST/PUT (Strapi format: { data: { ... } })",
        },
      },
      required: ["method", "endpoint"],
    },
    async execute(input, ctx) {
      const method = input.method as string;
      const endpoint = input.endpoint as string;
      const body = input.body as Record<string, unknown> | undefined;

      // Get user JWT from tool context (set per-session)
      const jwt = (ctx as any).strapiJwt as string | undefined;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (jwt) {
        headers["Authorization"] = `Bearer ${jwt}`;
      }

      const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctx.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        return `Error ${res.status}: ${text.slice(0, 2000)}`;
      }

      // Truncate large responses
      return text.slice(0, 30000);
    },
  };
}

export function getDefaultTools(config: {
  bash?: boolean;
  fileRead?: boolean;
  fileWrite?: boolean;
  webFetch?: boolean;
}): AgentTool[] {
  const tools: AgentTool[] = [];
  if (config.bash !== false) tools.push(bashTool);
  if (config.fileRead !== false) tools.push(fileReadTool);
  if (config.fileWrite !== false) tools.push(fileWriteTool);
  if (config.webFetch !== false) tools.push(webFetchTool);
  return tools;
}

import type { ToolDefinition } from './provider';

export interface PromptContext {
  // Project
  projectName: string;
  projectDescription?: string;
  agentPrompt?: string;
  knowledgeIndex?: any;
  repos?: any[];

  // User & Session
  userKey: string;
  sessionSource: 'web' | 'widget';
  memories: MemoryEntry[];

  // Runtime
  providerName: string;
  model: string;

  // Tools
  tools: ToolDefinition[];

  // Stats
  totalToolCalls?: number;
}

interface MemoryEntry {
  category: string;
  content: string;
  [key: string]: any;
}

// Layer 1: Identity & Role
function layerIdentity(ctx: PromptContext): string {
  return `You are Forge AI, the project assistant for "${ctx.projectName}".`;
}

// Layer 2: Core Behavior
function layerCoreBehavior(): string {
  return `You help users manage issues, tasks, and comments. You have direct access to project data through tools. Use tools proactively to answer questions. Be concise and present data in markdown.`;
}

// Layer 3: Project Context
function layerProjectContext(ctx: PromptContext): string {
  const parts: string[] = [];

  if (ctx.projectDescription?.trim()) {
    parts.push(`## Project Description\n${ctx.projectDescription.trim()}`);
  }

  if (ctx.repos?.length) {
    const repoList = ctx.repos.map((r: any) => `- ${r.name || r.url}`).join('\n');
    parts.push(`## Repositories\n${repoList}`);
  }

  if (ctx.knowledgeIndex) {
    const raw = typeof ctx.knowledgeIndex === 'string'
      ? ctx.knowledgeIndex
      : JSON.stringify(ctx.knowledgeIndex);
    const truncated = raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw;
    parts.push(`## Knowledge Base\n${truncated}`);
  }

  return parts.join('\n\n');
}

// Layer 4: Project Guidelines
function layerGuidelines(ctx: PromptContext): string {
  if (!ctx.agentPrompt?.trim()) return '';
  return `## Project Guidelines\n${ctx.agentPrompt.trim()}`;
}

// Layer 5: User Memory
function layerMemory(ctx: PromptContext): string {
  if (!ctx.memories?.length) return '';
  const lines = ctx.memories.map((m) => `- [${m.category}] ${m.content}`);
  return `## User Memory\n${lines.join('\n')}`;
}

// Layer 6: Runtime Info
function layerRuntime(ctx: PromptContext): string {
  return [
    `## Runtime`,
    `Current time: ${new Date().toISOString()}`,
    `Provider: ${ctx.providerName}, Model: ${ctx.model}`,
    `Session source: ${ctx.sessionSource}`,
  ].join('\n');
}

// Layer 7: Tool Descriptions
function layerTools(ctx: PromptContext): string {
  if (!ctx.tools.length) return '';
  const descriptions = ctx.tools
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join('\n');
  return `## Available Tools\n${descriptions}`;
}

// Layer 8: Behavioral Rules
function layerBehavior(): string {
  return [
    `## Instructions`,
    `- Use tools to look up data — don't ask the user for information you can query.`,
    `- Chain multiple tool calls when needed (e.g. list then get each).`,
    `- If results are empty, try broader filters or list all.`,
  ].join('\n');
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const layers = [
    layerIdentity(ctx),
    layerCoreBehavior(),
    layerProjectContext(ctx),
    layerGuidelines(ctx),
    layerMemory(ctx),
    layerRuntime(ctx),
    layerTools(ctx),
    layerBehavior(),
  ].filter(Boolean);

  return layers.join('\n\n');
}

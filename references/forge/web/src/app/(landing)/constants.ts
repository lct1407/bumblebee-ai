import { Sparkles, Terminal, Monitor, Database, RefreshCw, Link2 } from 'lucide-react';

export const features = [
  {
    icon: Sparkles,
    title: 'AI Issue Analysis',
    desc: 'Auto-enrich issues with AI-generated summaries, suggested solutions, and acceptance criteria. Supports vision for screenshots.',
  },
  {
    icon: Terminal,
    title: 'Agent Execution',
    desc: 'Run Claude AI agents directly on your codebase. Agents read knowledge indexes, create branches, and commit fixes autonomously.',
  },
  {
    icon: Monitor,
    title: 'Multi-Client',
    desc: 'Desktop app (Tauri) for local codebase access. Next.js web app for team collaboration. React Native mobile app on the go.',
  },
  {
    icon: Database,
    title: 'Knowledge Indexing',
    desc: 'Auto-index codebases to generate structured knowledge maps. Agents understand your architecture before writing code.',
  },
  {
    icon: RefreshCw,
    title: 'Real-Time Sync',
    desc: 'WebSocket-powered live updates across all clients. See changes, agent progress, and task completions instantly.',
  },
  {
    icon: Link2,
    title: 'MCP Integration',
    desc: 'Built-in Model Context Protocol server. Extend agent capabilities with custom tools and connect external sessions.',
  },
];

export const steps = [
  { num: '01', title: 'Create Issue', desc: 'File a bug or feature request with title, description, and screenshots.' },
  { num: '02', title: 'AI Enriches', desc: 'AI analyzes the issue, suggests a solution, and drafts acceptance criteria.' },
  { num: '03', title: 'Agent Executes', desc: 'Approve and an AI agent implements it — reading code, writing fixes, committing.' },
  { num: '04', title: 'Auto-Resolves', desc: 'When all tasks pass, the issue auto-transitions to resolved. Review and ship.' },
];

export const techStack = [
  { name: 'Next.js', color: '#000' },
  { name: 'Tauri', color: '#ffc131' },
  { name: 'Strapi', color: '#4945ff' },
  { name: 'Claude AI', color: '#f97316' },
  { name: 'TypeScript', color: '#3178c6' },
  { name: 'PostgreSQL', color: '#336791' },
  { name: 'React Native', color: '#61dafb' },
  { name: 'WebSocket', color: '#4ade80' },
  { name: 'Rust', color: '#c4432b' },
];

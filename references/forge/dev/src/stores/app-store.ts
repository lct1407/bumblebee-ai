import { create } from "zustand";
import type { AgentMessage, AppConfig } from "@/lib/types";

export interface AgentUsage {
  /** Latest input_tokens = current context size */
  contextUsed: number;
  /** Accumulated output tokens across all turns */
  outputTotal: number;
  /** Accumulated cache read tokens */
  cacheRead: number;
  /** Number of API turns */
  turns: number;
}

export { CONTEXT_LIMIT } from "@/lib/constants";

const EMPTY_USAGE: AgentUsage = { contextUsed: 0, outputTotal: 0, cacheRead: 0, turns: 0 };

interface AppState {
  activeProject: string | null;
  setActiveProject: (slug: string | null) => void;

  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;

  agentMessages: AgentMessage[];
  agentRunning: boolean;
  agentSessionId: string | null;
  agentUsage: AgentUsage;
  addAgentMessage: (msg: AgentMessage) => void;
  clearAgentMessages: () => void;
  setAgentRunning: (v: boolean) => void;
  setAgentSessionId: (id: string | null) => void;
  updateAgentUsage: (usage: NonNullable<AgentMessage["usage"]>) => void;
  updateAgentUsageFromStored: (usage: AgentUsage) => void;
  resetAgentUsage: () => void;

  config: AppConfig;
  setConfig: (c: AppConfig) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeProject: null,
  setActiveProject: (slug) => set({ activeProject: slug }),

  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),

  agentMessages: [],
  agentRunning: false,
  agentSessionId: null,
  agentUsage: EMPTY_USAGE,
  addAgentMessage: (msg) =>
    set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
  clearAgentMessages: () => set({ agentMessages: [] }),
  setAgentRunning: (v) => set({ agentRunning: v }),
  setAgentSessionId: (id) => set({ agentSessionId: id }),
  updateAgentUsage: (usage) =>
    set((s) => ({
      agentUsage: {
        contextUsed: usage.input_tokens || s.agentUsage.contextUsed,
        outputTotal: s.agentUsage.outputTotal + (usage.output_tokens || 0),
        cacheRead: s.agentUsage.cacheRead + (usage.cache_read_input_tokens || 0),
        turns: s.agentUsage.turns + 1,
      },
    })),
  updateAgentUsageFromStored: (usage) => set({ agentUsage: usage }),
  resetAgentUsage: () =>
    set({ agentUsage: EMPTY_USAGE }),

  config: {
    strapiUrl: "http://localhost:1337",
    authToken: "",
    projects: {},
  },
  setConfig: (c) => set({ config: c }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

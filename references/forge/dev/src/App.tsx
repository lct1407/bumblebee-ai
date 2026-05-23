import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, Outlet } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { Dashboard, Settings, LoginPage, UsagePage } from "@/pages/app";
import { ProjectIssues, NewIssuePage, ProjectBoard, AgentChat, ProjectSettings, KnowledgePage, McpPage, SkillsPage, ProjectOverview } from "@/pages/project";
import { ProjectAgents } from "@/pages/project/ProjectAgents";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatPreview } from "@/pages/preview/ChatPreview";
import { useWebSocket } from "@/hooks/use-web-socket";
import { useLocalConfig } from "@/hooks/use-local-config";
import { useAutoUpdater } from "@/hooks/use-auto-updater";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAppStore } from "@/stores/app-store";
import { useState } from "react";
import clsx from "clsx";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { config } = useAppStore();
  const location = useLocation();
  if (!config.authToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function ProjectLayout() {
  const { slug } = useParams<{ slug: string }>();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-full">
      <div className={clsx("flex-1 overflow-y-auto", chatOpen && "border-r border-gray-200")}>
        <Outlet />
      </div>
      {chatOpen && slug && (
        <div className="w-80 shrink-0 lg:w-96">
          <ChatSidebar projectSlug={slug} onClose={() => setChatOpen(false)} />
        </div>
      )}
      {/* Chat toggle button - fixed to bottom right when chat is closed */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-lg hover:bg-gray-800 transition-colors"
          title="Open Chat"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function AppInner() {
  useWebSocket();
  useLocalConfig();
  useKeyboardShortcuts();
  const { config } = useAppStore();
  const { updateAvailable, installUpdate } = useAutoUpdater();
  const isLoggedIn = !!config.authToken;

  return (
    <div className="flex h-screen flex-col bg-white">
      {updateAvailable && (
        <div className="flex items-center justify-between bg-blue-600 px-4 py-2 text-sm text-white">
          <span>A new version of Forge Dev is available.</span>
          <button
            onClick={installUpdate}
            className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
          >
            Update Now
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {isLoggedIn && <Sidebar />}
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/preview" element={<ChatPreview />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/project/:slug" element={<RequireAuth><ProjectLayout /></RequireAuth>}>
              <Route path="overview" element={<ProjectOverview />} />
              <Route path="issues" element={<ProjectIssues />} />
              <Route path="issues/new" element={<NewIssuePage />} />
              <Route path="board" element={<ProjectBoard />} />
              <Route path="agent" element={<AgentChat />} />
              <Route path="agents" element={<ProjectAgents />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="mcp" element={<McpPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
            <Route path="/usage" element={<RequireAuth><UsagePage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

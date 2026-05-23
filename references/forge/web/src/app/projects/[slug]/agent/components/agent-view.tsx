'use client';

import { AgentSidebar } from './agent-sidebar';
import { AgentChatArea } from './agent-chat-area';
import { useAgentPage } from '../hooks';

export function AgentView() {
  const {
    slug,
    sessions,
    loadingSessions,
    activeSessionId,
    desktopConnected,
    showSessions,
    setShowSessions,
    messages,
    isRunning,
    sessionId,
    draftPrompt,
    isBuildingPrompt,
    editablePrompt,
    setEditablePrompt,
    usage,
    abortAgent,
    viewTab,
    setViewTab,
    showChangesTab,
    diff,
    diffLoading,
    handleNewChat,
    handleSearchSessions,
    handleSelectSession,
    handleSend,
    handleStartFromPrompt,
    handleCancelDraft,
  } = useAgentPage();

  const sessionTitle = sessionId
    ? (sessions.find((s) => s.documentId === sessionId)?.title || 'Agent Chat')
    : 'New Agent Chat';

  return (
    <div className="flex flex-1 min-h-0 bg-[#0c0c0c] overflow-hidden md:rounded-lg md:border md:border-[#333333]">
      <AgentSidebar
        slug={slug}
        sessions={sessions}
        loadingSessions={loadingSessions}
        activeSessionId={activeSessionId}
        desktopConnected={desktopConnected}
        showSessions={showSessions}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onSearch={handleSearchSessions}
      />

      <AgentChatArea
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        showSessions={showSessions}
        onShowSessions={() => setShowSessions(true)}
        messages={messages}
        isRunning={isRunning}
        usage={usage}
        draftPrompt={draftPrompt}
        isBuildingPrompt={isBuildingPrompt}
        editablePrompt={editablePrompt}
        onEditablePromptChange={setEditablePrompt}
        onCancelDraft={handleCancelDraft}
        onStartFromPrompt={handleStartFromPrompt}
        viewTab={viewTab}
        setViewTab={setViewTab}
        showChangesTab={showChangesTab}
        diff={diff}
        diffLoading={diffLoading}
        onSend={handleSend}
        onStop={abortAgent}
      />
    </div>
  );
}

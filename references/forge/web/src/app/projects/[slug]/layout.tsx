'use client';

import { Shell } from '@/components/layout/shell';
import { useProject } from '@/features/project/hooks/use-projects';
import { ProjectChat } from '@/components/chat/project-chat';
import { AgentStreamProvider } from '@/hooks/agent-stream-context';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useSetPageTitle } from '@/hooks/use-page-title';
import { useAgentStreamContext } from '@/hooks/agent-stream-context';
import { useState, useEffect, type ReactNode } from 'react';
import { MessageCircle, X } from 'lucide-react';

/** Auto-navigate to agent page when a preview prompt arrives via WS */
function PreviewPromptNavigator({ slug }: { slug: string }) {
  const { draftPrompt } = useAgentStreamContext();
  const router = useRouter();
  const pathname = usePathname();
  const agentPath = `/projects/${slug}/agent`;

  useEffect(() => {
    if (draftPrompt && pathname !== agentPath) {
      router.push(agentPath);
    }
  }, [draftPrompt, pathname, agentPath, router]);

  return null;
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const { data, isLoading } = useProject(slug);
  const project = data?.data;
  const base = `/projects/${slug}`;
  const [chatOpen, setChatOpen] = useState(false);
  const isAgentPage = pathname === `${base}/agent`;
  useSetPageTitle(project?.name ?? '');

  return (
    <Shell>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading project...</p>
      ) : !project ? (
        <p className="text-sm text-gray-500">Project not found.</p>
      ) : (
        <AgentStreamProvider projectSlug={slug}>
          <PreviewPromptNavigator slug={slug} />
          <div className={cn('flex flex-1 min-h-0 overflow-hidden gap-0', isAgentPage && 'bg-[#0c0c0c]')}>
            {/* Main content */}
            <div className={cn(
              'flex-1 min-h-0 flex flex-col',
              isAgentPage ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden px-2 py-3 sm:p-6',
              chatOpen && 'hidden md:flex md:border-r'
            )}>
              {children}
            </div>

            {/* Chat sidebar — full screen on mobile, side panel on md+ */}
            {chatOpen && (
              <div className="flex w-full min-h-0 flex-1 flex-col bg-white md:w-80 md:flex-none lg:w-96">
                <ProjectChat
                  projectSlug={slug}
                  onClose={() => setChatOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Floating chat bubble */}
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-lg hover:bg-gray-800 transition-colors"
              aria-label="Open chat"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}
        </AgentStreamProvider>
      )}
    </Shell>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllRead } from '../hooks/use-notifications';
import type { Notification, NotificationType } from '../types';
import { cn } from '@/lib/utils/cn';

const TYPE_ICONS: Record<NotificationType, string> = {
  issue_status_changed: '●',
  comment_added: '💬',
  agent_completed: '🤖',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const params = useParams();
  const projectSlug = params?.slug as string | undefined;

  const { data: countData } = useUnreadCount(projectSlug);
  const { data: notifData, isLoading } = useNotifications(projectSlug, open);
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();
  const router = useRouter();

  const unreadCount = countData?.data?.count ?? 0;
  const notifications = notifData?.data ?? [];

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleClick(n: Notification) {
    if (!n.read) markAsRead.mutate(n.documentId);
    setOpen(false);
    if (n.issueDocumentId && projectSlug) {
      router.push(`/projects/${projectSlug}/issues?issue=${n.issueDocumentId}`);
    } else if (n.agentSessionDocumentId && projectSlug) {
      router.push(`/projects/${projectSlug}/agent?session=${n.agentSessionDocumentId}`);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          'absolute top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg',
          align === 'left' ? 'left-0' : 'right-0',
        )}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate(undefined)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.documentId}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50',
                    !n.read && 'bg-blue-50/50',
                  )}
                >
                  <span className="mt-0.5 text-sm">{TYPE_ICONS[n.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', !n.read ? 'font-medium text-gray-900' : 'text-gray-700')}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{n.body}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { usePageTitle, usePageHeaderAction } from '@/hooks/use-page-title';
import { NotificationBell } from '@/features/notification/components/notification-bell';

interface MobileHeaderProps {
  onMenuOpen: () => void;
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  const title = usePageTitle();
  const action = usePageHeaderAction();
  return (
    <div className="shrink-0 z-30 flex h-12 items-center gap-2 border-b bg-white px-4 md:hidden">
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{title}</h1>
      {action}
      <NotificationBell />
      <button
        onClick={onMenuOpen}
        className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  );
}

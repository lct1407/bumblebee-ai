'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { SidebarNav } from './sidebar-nav';
import { MobileHeader } from './mobile-header';
import { useIosViewport } from './hooks/use-ios-viewport';

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shellRef = useIosViewport();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div ref={shellRef} className="fixed inset-0 flex bg-gray-50">
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r bg-gray-50 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <SidebarNav onClose={() => setMobileOpen(false)} />
      </aside>

      <main className="relative min-w-0 flex-1 flex flex-col overflow-hidden overflow-x-hidden md:ml-56">
        <MobileHeader onMenuOpen={() => setMobileOpen(true)} />
        {children}
      </main>
    </div>
  );
}

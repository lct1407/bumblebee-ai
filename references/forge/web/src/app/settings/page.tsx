'use client';

import { Shell } from '@/components/layout/shell';
import { useAuth } from '@/providers/auth-provider';
import { SectionHeading } from '@/components/ui/section-heading';
import { useSetPageTitle } from '@/hooks/use-page-title';

export default function SettingsPage() {
  const { user } = useAuth();
  useSetPageTitle('Settings');

  return (
    <Shell>
    <div className="flex-1 overflow-y-auto">
    <div className="mx-auto max-w-2xl px-2 py-3 sm:p-6">
      <h1 className="mb-1 hidden text-xl font-bold sm:text-2xl text-gray-900 md:block">Settings</h1>
      <p className="mb-8 text-sm text-gray-500">Manage your account and preferences.</p>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
        <SectionHeading>Account</SectionHeading>
        <div className="space-y-3 text-sm">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-gray-500">Username</span>
            <span className="truncate font-medium text-gray-900">{user?.username ?? '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-gray-500">Email</span>
            <span className="truncate font-medium text-gray-900">{user?.email ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <SectionHeading>About</SectionHeading>
        <p className="text-sm text-gray-500">
          Forge Web — project management powered by AI agents.
        </p>
      </section>
    </div>
    </div>
    </Shell>
  );
}

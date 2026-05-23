'use client';

import { Input, Label, SectionHeading } from '@/components/ui';

interface SentrySectionProps {
  sentryProject: string;
  setSentryProject: (v: string) => void;
}

export function SentrySection({ sentryProject, setSentryProject }: SentrySectionProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <SectionHeading>Sentry</SectionHeading>
      <div className="space-y-4">
        <div>
          <Label>Sentry Project Slug</Label>
          <Input
            type="text"
            value={sentryProject}
            onChange={(e) => setSentryProject(e.target.value)}
            placeholder="e.g. teamix-nextjs (leave empty for all projects)"
          />
          <p className="mt-1 text-xs text-gray-500">
            Scope Sentry error queries to this project. Leave empty to search all projects in the org.
          </p>
        </div>
      </div>
    </section>
  );
}

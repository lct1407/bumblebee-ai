'use client';

import { useParams } from 'next/navigation';
import { SettingsView } from './components';
import { useSettingsForm } from './hooks';

export default function ProjectSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isLoading, project, ...formProps } = useSettingsForm(slug);

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!project) return <p className="text-sm text-gray-500">Project not found.</p>;

  return <SettingsView {...formProps} />;
}

'use client';

import { AlertBanner, Button } from '@/components/ui';
import type { useSettingsForm } from '../hooks';
import { AIConfigSection } from './ai-config-section';
import { CoolifySection } from './coolify-section';
import { GeneralSection } from './general-section';
import { SentrySection } from './sentry-section';
import { WebhookSection } from './webhook-section';

type SettingsFormReturn = ReturnType<typeof useSettingsForm>;

type SettingsViewProps = Omit<SettingsFormReturn, 'isLoading' | 'project'>;

export function SettingsView({
  updateProject,
  name, setName,
  description, setDescription,
  defaultProvider, setDefaultProvider,
  agentProvider, setAgentProvider,
  agentPrompt, setAgentPrompt,
  agentMemoryEnabled, setAgentMemoryEnabled,
  coolifyUrl, setCoolifyUrl,
  coolifyApiKey, setCoolifyApiKey,
  coolifyResources, updateResource, removeResource, addResource,
  sentryProject, setSentryProject,
  webhookUrl, setWebhookUrl,
  webhookSecret, setWebhookSecret,
  webhookStatuses, setWebhookStatuses,
  handleSave,
}: SettingsViewProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-xl font-bold text-gray-900">Project Settings</h2>
      <p className="mb-8 text-sm text-gray-500">Configure project details and AI behavior.</p>

      {updateProject.isError && (
        <AlertBanner variant="error">Failed to save settings. Please try again.</AlertBanner>
      )}

      {updateProject.isSuccess && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Settings saved.
        </div>
      )}

      <GeneralSection
        name={name} setName={setName}
        description={description} setDescription={setDescription}
      />

      <AIConfigSection
        defaultProvider={defaultProvider} setDefaultProvider={setDefaultProvider}
        agentProvider={agentProvider} setAgentProvider={setAgentProvider}
        agentPrompt={agentPrompt} setAgentPrompt={setAgentPrompt}
        agentMemoryEnabled={agentMemoryEnabled} setAgentMemoryEnabled={setAgentMemoryEnabled}
      />

      <CoolifySection
        coolifyUrl={coolifyUrl} setCoolifyUrl={setCoolifyUrl}
        coolifyApiKey={coolifyApiKey} setCoolifyApiKey={setCoolifyApiKey}
        coolifyResources={coolifyResources}
        updateResource={updateResource}
        removeResource={removeResource}
        addResource={addResource}
      />

      <SentrySection
        sentryProject={sentryProject} setSentryProject={setSentryProject}
      />

      <WebhookSection
        webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
        webhookSecret={webhookSecret} setWebhookSecret={setWebhookSecret}
        webhookStatuses={webhookStatuses} setWebhookStatuses={setWebhookStatuses}
      />

      <Button onClick={handleSave} disabled={updateProject.isPending}>
        {updateProject.isPending ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}

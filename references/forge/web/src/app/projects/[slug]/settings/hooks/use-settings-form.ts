'use client';

import { useEffect, useState } from 'react';
import { useProject, useUpdateProject } from '@/features/project/hooks/use-projects';
import type { AIProvider } from '@/features/project/types';

export function useSettingsForm(slug: string) {
  const { data, isLoading } = useProject(slug);
  const project = data?.data;
  const updateProject = useUpdateProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<AIProvider | ''>('');
  const [agentProvider, setAgentProvider] = useState<AIProvider | ''>('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentMemoryEnabled, setAgentMemoryEnabled] = useState(true);
  const [coolifyUrl, setCoolifyUrl] = useState('');
  const [coolifyApiKey, setCoolifyApiKey] = useState('');
  const [coolifyResources, setCoolifyResources] = useState<{ name: string; uuid: string }[]>([]);
  const [sentryProject, setSentryProject] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookStatuses, setWebhookStatuses] = useState<string[]>([]);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setDefaultProvider(project.defaultProvider ?? '');
    setAgentProvider(project.agentProvider ?? '');
    setAgentPrompt(project.agentPrompt ?? '');
    setAgentMemoryEnabled(project.agentMemoryEnabled !== false);
    setCoolifyUrl(project.coolifyUrl ?? '');
    setCoolifyApiKey(project.coolifyApiKey ?? '');
    setCoolifyResources(project.coolifyResources ?? []);
    setSentryProject(project.sentryProject ?? '');
    setWebhookUrl(project.webhookUrl ?? '');
    setWebhookSecret(project.webhookSecret ?? '');
    setWebhookStatuses(project.webhookStatuses ?? []);
  }, [project]);

  const handleSave = () => {
    if (!project) return;
    updateProject.mutate({
      id: project.documentId,
      data: {
        name,
        description,
        defaultProvider: (defaultProvider || 'anthropic') as AIProvider,
        agentProvider: (agentProvider || null) as AIProvider | null,
        agentPrompt: agentPrompt || null,
        agentMemoryEnabled,
        coolifyUrl: coolifyUrl || null,
        coolifyApiKey: coolifyApiKey || null,
        coolifyResources,
        sentryProject: sentryProject || null,
        webhookUrl: webhookUrl || null,
        webhookSecret: webhookSecret || null,
        webhookStatuses,
      },
    });
  };

  const updateResource = (index: number, field: 'name' | 'uuid', value: string) => {
    setCoolifyResources((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const removeResource = (index: number) => {
    setCoolifyResources((prev) => prev.filter((_, i) => i !== index));
  };

  const addResource = () => {
    setCoolifyResources((prev) => [...prev, { name: '', uuid: '' }]);
  };

  return {
    isLoading,
    project,
    updateProject,
    // general
    name, setName,
    description, setDescription,
    // ai config
    defaultProvider, setDefaultProvider,
    agentProvider, setAgentProvider,
    agentPrompt, setAgentPrompt,
    agentMemoryEnabled, setAgentMemoryEnabled,
    // coolify
    coolifyUrl, setCoolifyUrl,
    coolifyApiKey, setCoolifyApiKey,
    coolifyResources,
    updateResource,
    removeResource,
    addResource,
    // sentry
    sentryProject, setSentryProject,
    // webhook
    webhookUrl, setWebhookUrl,
    webhookSecret, setWebhookSecret,
    webhookStatuses, setWebhookStatuses,
    // actions
    handleSave,
  };
}

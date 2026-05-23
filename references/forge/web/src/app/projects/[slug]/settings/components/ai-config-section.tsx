'use client';

import { Checkbox, Label, SectionHeading, Select, Textarea } from '@/components/ui';
import type { AIProvider } from '@/features/project/types';
import { AI_PROVIDERS } from '../constants';

interface AIConfigSectionProps {
  defaultProvider: AIProvider | '';
  setDefaultProvider: (v: AIProvider | '') => void;
  agentProvider: AIProvider | '';
  setAgentProvider: (v: AIProvider | '') => void;
  agentPrompt: string;
  setAgentPrompt: (v: string) => void;
  agentMemoryEnabled: boolean;
  setAgentMemoryEnabled: (v: boolean) => void;
}

export function AIConfigSection({
  defaultProvider,
  setDefaultProvider,
  agentProvider,
  setAgentProvider,
  agentPrompt,
  setAgentPrompt,
  agentMemoryEnabled,
  setAgentMemoryEnabled,
}: AIConfigSectionProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <SectionHeading>AI Configuration</SectionHeading>
      <div className="space-y-4">
        <div>
          <Label>Default Provider</Label>
          <Select
            value={defaultProvider}
            onChange={(e) => setDefaultProvider(e.target.value as AIProvider | '')}
            className="w-full"
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Agent Provider</Label>
          <Select
            value={agentProvider}
            onChange={(e) => setAgentProvider(e.target.value as AIProvider | '')}
            className="w-full"
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-gray-400">Overrides the default provider for agent tasks.</p>
        </div>
        <div>
          <Label>Agent Prompt</Label>
          <Textarea
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            rows={4}
            placeholder="Custom instructions for the AI agent..."
          />
        </div>
        <Checkbox
          id="agentMemory"
          checked={agentMemoryEnabled}
          onChange={(e) => setAgentMemoryEnabled(e.target.checked)}
          label="Enable agent memory"
        />
      </div>
    </section>
  );
}

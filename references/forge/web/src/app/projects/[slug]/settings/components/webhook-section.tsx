'use client';

import { Checkbox, Input, Label, SectionHeading } from '@/components/ui';
import { ALL_STATUSES } from '@/lib/constants';

interface WebhookSectionProps {
  webhookUrl: string;
  setWebhookUrl: (v: string) => void;
  webhookSecret: string;
  setWebhookSecret: (v: string) => void;
  webhookStatuses: string[];
  setWebhookStatuses: (v: string[] | ((prev: string[]) => string[])) => void;
}

export function WebhookSection({
  webhookUrl,
  setWebhookUrl,
  webhookSecret,
  setWebhookSecret,
  webhookStatuses,
  setWebhookStatuses,
}: WebhookSectionProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <SectionHeading>Webhook Notifications</SectionHeading>
      <p className="mb-4 text-xs text-gray-400">
        Send an HTTP POST to a URL when issue status changes.
      </p>
      <div className="space-y-4">
        <div>
          <Label>Webhook URL</Label>
          <Input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.example.com/notify"
          />
        </div>
        <div>
          <Label hint="(optional)">Secret / Token</Label>
          <Input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="e.g. Bearer mytoken or ApiKey xyz"
          />
        </div>
        <div>
          <Label>Trigger on statuses</Label>
          <p className="mb-2 text-xs text-gray-400">Leave all unchecked to trigger on every status change.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ALL_STATUSES.map((s) => (
              <Checkbox
                key={s.value}
                id={`webhook-status-${s.value}`}
                checked={webhookStatuses.includes(s.value)}
                onChange={(e) => {
                  setWebhookStatuses((prev) =>
                    e.target.checked
                      ? [...prev, s.value]
                      : prev.filter((v) => v !== s.value)
                  );
                }}
                label={s.label}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

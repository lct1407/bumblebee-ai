'use client';

import { Button, Input, Label, SectionHeading } from '@/components/ui';

interface CoolifySectionProps {
  coolifyUrl: string;
  setCoolifyUrl: (v: string) => void;
  coolifyApiKey: string;
  setCoolifyApiKey: (v: string) => void;
  coolifyResources: { name: string; uuid: string }[];
  updateResource: (index: number, field: 'name' | 'uuid', value: string) => void;
  removeResource: (index: number) => void;
  addResource: () => void;
}

export function CoolifySection({
  coolifyUrl,
  setCoolifyUrl,
  coolifyApiKey,
  setCoolifyApiKey,
  coolifyResources,
  updateResource,
  removeResource,
  addResource,
}: CoolifySectionProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <SectionHeading>Coolify Deployment</SectionHeading>
      <div className="space-y-4">
        <div>
          <Label>Coolify URL</Label>
          <Input
            type="url"
            value={coolifyUrl}
            onChange={(e) => setCoolifyUrl(e.target.value)}
            placeholder="https://coolify.example.com"
          />
        </div>
        <div>
          <Label>API Key</Label>
          <Input
            type="password"
            value={coolifyApiKey}
            onChange={(e) => setCoolifyApiKey(e.target.value)}
            placeholder="Bearer token from Coolify"
          />
        </div>
        <div>
          <Label>Resources</Label>
          <div className="space-y-2">
            {coolifyResources.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={r.name}
                  onChange={(e) => updateResource(i, 'name', e.target.value)}
                  placeholder="Name (e.g. web, api)"
                  className="w-1/3"
                />
                <Input
                  type="text"
                  value={r.uuid}
                  onChange={(e) => updateResource(i, 'uuid', e.target.value)}
                  placeholder="UUID"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeResource(i)}
                  className="text-red-500 hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addResource}
              className="border-dashed"
            >
              + Add Resource
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import { Input, Label, SectionHeading, Textarea } from '@/components/ui';

interface GeneralSectionProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
}

export function GeneralSection({ name, setName, description, setDescription }: GeneralSectionProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
      <SectionHeading>General</SectionHeading>
      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </section>
  );
}

import { safeParseEnrichment, JSON_SCHEMA, type EnrichmentResult, type AttachmentInfo } from './enrichment-utils';

const FETCH_TIMEOUT_MS = 30_000;

export function buildOpenAIMessages(title: string, description: string, attachments: AttachmentInfo[]) {
  const content: any[] = [];

  for (const att of attachments) {
    if (att.mime.startsWith('image/')) {
      content.push({ type: 'image_url', image_url: { url: att.url } });
    }
  }

  content.push({
    type: 'text',
    text: `Analyze this issue and respond with valid JSON only (no markdown fences).

Title: ${title}
Description: ${description || 'No description provided'}
${attachments.length > 0 ? `Attachments: ${attachments.map((a) => a.name).join(', ')}` : ''}

Respond with this exact JSON structure:
${JSON_SCHEMA}`,
  });

  return [{ role: 'user' as const, content }];
}

export async function callOpenAI(apiKey: string, title: string, description: string, attachments: AttachmentInfo[]): Promise<EnrichmentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: buildOpenAIMessages(title, description, attachments),
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return safeParseEnrichment(text);
  } finally {
    clearTimeout(timeout);
  }
}

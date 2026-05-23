import { safeParseEnrichment, JSON_SCHEMA, type EnrichmentResult, type AttachmentInfo } from './enrichment-utils';

const FETCH_TIMEOUT_MS = 30_000;

export function buildAnthropicMessages(title: string, description: string, attachments: AttachmentInfo[]) {
  const content: any[] = [];

  for (const att of attachments) {
    if (att.mime.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'url', url: att.url },
      });
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

  return [{ role: 'user', content }];
}

export async function callAnthropic(apiKey: string, title: string, description: string, attachments: AttachmentInfo[]): Promise<EnrichmentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1024,
        messages: buildAnthropicMessages(title, description, attachments),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text || '{}';
    return safeParseEnrichment(text);
  } finally {
    clearTimeout(timeout);
  }
}

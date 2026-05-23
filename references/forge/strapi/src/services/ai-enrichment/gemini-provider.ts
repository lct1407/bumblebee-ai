import { safeParseEnrichment, JSON_SCHEMA, type EnrichmentResult, type AttachmentInfo } from './enrichment-utils';

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}

export async function callGemini(apiKey: string, title: string, description: string, attachments: AttachmentInfo[]): Promise<EnrichmentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const parts: any[] = [];

  for (const att of attachments) {
    if (att.mime.startsWith('image/')) {
      try {
        const base64Data = await fetchImageAsBase64(att.url);
        parts.push({
          inlineData: {
            mimeType: att.mime,
            data: base64Data,
          },
        });
      } catch (err) {
        // Skip images that fail to fetch, include as text reference instead
        parts.push({ text: `[Image attachment: ${att.name} (failed to load)]` });
      }
    }
  }

  parts.push({
    text: `Analyze this issue and respond with valid JSON only (no markdown fences).

Title: ${title}
Description: ${description || 'No description provided'}

Respond with this exact JSON structure:
${JSON_SCHEMA}`,
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return safeParseEnrichment(text);
  } finally {
    clearTimeout(timeout);
  }
}

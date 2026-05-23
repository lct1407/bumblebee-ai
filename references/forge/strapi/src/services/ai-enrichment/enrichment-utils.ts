export interface EnrichmentResult {
  aiSummary: string;
  aiSuggestedSolution: string;
  aiAcceptanceCriteria: string[];
  aiConfidence: number;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

export interface AttachmentInfo {
  url: string;
  mime: string;
  name: string;
}

export const DEFAULT_ENRICHMENT: EnrichmentResult = {
  aiSummary: 'Unable to analyze issue',
  aiSuggestedSolution: 'Manual review required',
  aiAcceptanceCriteria: [],
  aiConfidence: 0,
  category: 'question',
  priority: 'none',
};

export function safeParseEnrichment(text: string): EnrichmentResult {
  try {
    // Strip markdown fences if present (```json ... ```)
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      aiSummary: parsed.aiSummary || DEFAULT_ENRICHMENT.aiSummary,
      aiSuggestedSolution: parsed.aiSuggestedSolution || DEFAULT_ENRICHMENT.aiSuggestedSolution,
      aiAcceptanceCriteria: Array.isArray(parsed.aiAcceptanceCriteria) ? parsed.aiAcceptanceCriteria : [],
      aiConfidence: typeof parsed.aiConfidence === 'number' ? parsed.aiConfidence : 0,
      category: parsed.category || DEFAULT_ENRICHMENT.category,
      priority: parsed.priority || DEFAULT_ENRICHMENT.priority,
    };
  } catch {
    return { ...DEFAULT_ENRICHMENT };
  }
}

export const PROMPT_TEXT = `Analyze this issue and respond with valid JSON only (no markdown fences).`;

export const JSON_SCHEMA = `{
  "aiSummary": "concise summary of the issue",
  "aiSuggestedSolution": "suggested approach to resolve",
  "aiAcceptanceCriteria": ["criterion 1", "criterion 2"],
  "aiConfidence": 0.85,
  "category": "bug|feature|improvement|question|documentation",
  "priority": "critical|high|medium|low|none"
}`;

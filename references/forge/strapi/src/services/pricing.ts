const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-6-20251101': { input: 15, output: 75 },
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
}; // per million tokens

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  let pricing = PRICING[model];
  if (!pricing) {
    const key = Object.keys(PRICING).find((k) => model.startsWith(k));
    if (key) pricing = PRICING[key];
  }
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

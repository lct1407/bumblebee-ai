export const ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export const MODEL_DEFAULTS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
};

/**
 * Resolve the provider name and API key. Tries configured provider first, falls back to any available key.
 */
export function resolveProvider(project: any): { providerName: 'anthropic' | 'openai' | 'gemini'; apiKey: string } | null {
  const configured = project.agentProvider || project.defaultProvider || null;
  let providerName = configured;
  let apiKey = configured ? process.env[ENV_KEYS[configured]] : undefined;

  if (!apiKey) {
    for (const [name, envKey] of Object.entries(ENV_KEYS)) {
      if (process.env[envKey]) {
        providerName = name;
        apiKey = process.env[envKey];
        break;
      }
    }
  }

  if (!providerName || !apiKey) return null;
  return { providerName, apiKey };
}

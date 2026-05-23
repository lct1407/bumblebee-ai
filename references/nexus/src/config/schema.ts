import { z } from "zod";

export const configSchema = z.object({
  gateway: z.object({
    port: z.number().default(3100),
    token: z.string().optional(),
  }).default({}),
  providers: z.object({
    anthropic: z.object({
      apiKey: z.string(),
      defaultModel: z.string().default("claude-sonnet-4-5-20250929"),
    }).optional(),
    openai: z.object({
      apiKey: z.string(),
      defaultModel: z.string().default("gpt-4o"),
    }).optional(),
    gemini: z.object({
      apiKey: z.string(),
      defaultModel: z.string().default("gemini-2.0-flash"),
    }).optional(),
  }).default({}),
  agent: z.object({
    defaultProvider: z.enum(["anthropic", "openai", "gemini"]).default("anthropic"),
    maxContextTokens: z.number().default(100000),
    systemPrompt: z.string().optional(),
    tools: z.object({
      bash: z.boolean().default(true),
      fileRead: z.boolean().default(true),
      fileWrite: z.boolean().default(true),
      webFetch: z.boolean().default(true),
    }).default({}),
  }).default({}),
  channels: z.object({
    telegram: z.object({
      token: z.string(),
      allowFrom: z.array(z.string()).default([]),
      dmPolicy: z.enum(["open", "allowlist", "pairing"]).default("pairing"),
    }).optional(),
  }).default({}),
  strapi: z.object({
    baseUrl: z.string().default("http://localhost:1337/api"),
    corsOrigins: z.array(z.string()).default(["http://localhost:3000"]),
  }).optional(),
  session: z.object({
    resetIdleMinutes: z.number().default(120),
    maxTranscriptSize: z.number().default(1000),
  }).default({}),
  memory: z.object({
    enabled: z.boolean().default(true),
    maxPerUser: z.number().default(20),
    pruneAfterDays: z.number().default(30),
  }).default({}),
});

export type NexusConfig = z.infer<typeof configSchema>;

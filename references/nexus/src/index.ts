import { loadConfig, getDataDir } from "./config/loader.js";
import { createLogger } from "./utils/logger.js";
import { Gateway, type AuthenticatedWebSocket } from "./gateway/server.js";
import { SessionStore } from "./session/store.js";
import { TranscriptWriter } from "./session/transcript.js";
import { ChannelRegistry } from "./channel/registry.js";
import { TelegramPlugin } from "./channels/telegram/plugin.js";
import { createProvider } from "./agent/provider.js";
import { getDefaultTools, createStrapiApiTool, type AgentTool } from "./agent/tools.js";
import { createChartTool, createCodeRunTool } from "./agent/analysis-tools.js";
import { createHrmTools } from "./agent/hrm-tools.js";
import { runAgent, type AgentRunResult } from "./agent/runner.js";
import { MessageDebouncer } from "./queue/debounce.js";
import { ReplyPipeline } from "./queue/reply-pipeline.js";
import { setupDashboard } from "./web/dashboard.js";
import type { NormalizedMessage } from "./channel/message.js";
import type { AIProvider, Message, StreamEvent } from "./agent/provider.js";
import { MemoryService } from "./memory/service.js";
import { createMemoryTool } from "./memory/tool.js";
import { extractMemories } from "./memory/extractor.js";
import { join } from "node:path";

const log = createLogger("nexus");

const activeRuns = new Map<string, AbortController>();

async function main() {
  log.info("Starting Nexus...");

  // 1. Load config
  const config = await loadConfig();
  log.info("Config loaded");

  // 2. Init session store
  const dataDir = getDataDir();
  const sessionStore = new SessionStore(dataDir);
  await sessionStore.init();

  const sessionsDir = join(dataDir, "sessions");
  const transcript = new TranscriptWriter(sessionsDir);

  // 3. Init AI provider
  let provider: AIProvider | undefined;
  const defaultProvider = config.agent.defaultProvider;

  if (defaultProvider === "anthropic" && config.providers.anthropic) {
    provider = await createProvider("anthropic", config.providers.anthropic.apiKey);
  } else if (defaultProvider === "openai" && config.providers.openai) {
    provider = await createProvider("openai", config.providers.openai.apiKey);
  } else if (defaultProvider === "gemini" && config.providers.gemini) {
    provider = await createProvider("gemini", config.providers.gemini.apiKey);
  }

  if (!provider) {
    log.warn("No AI provider configured — agent features disabled");
  }

  const defaultModel =
    defaultProvider === "anthropic"
      ? config.providers.anthropic?.defaultModel ?? "claude-sonnet-4-5-20250929"
      : defaultProvider === "gemini"
        ? config.providers.gemini?.defaultModel ?? "gemini-2.0-flash"
        : config.providers.openai?.defaultModel ?? "gpt-4o";

  // 4. Build tools
  const baseTools = getDefaultTools(config.agent.tools);
  const strapiTool = config.strapi
    ? createStrapiApiTool(config.strapi.baseUrl)
    : undefined;

  // Analysis tools
  const chartsDir = join(dataDir, "charts");
  const sandboxDir = join(dataDir, "sandbox");
  const publicUrl = `http://localhost:${config.gateway.port}`;
  const chartTool = createChartTool(chartsDir, publicUrl);
  const codeRunTool = createCodeRunTool(sandboxDir);

  // HRM SDK tools
  const hrmTools = config.strapi ? createHrmTools(config.strapi.baseUrl) : [];

  // Memory system
  let memoryService: MemoryService | undefined;
  let memoryTool: AgentTool | undefined;
  if (config.memory.enabled) {
    memoryService = new MemoryService(dataDir, config.memory);
    memoryService.init();
    memoryTool = createMemoryTool(memoryService);
    // Prune old memories on startup + every 6 hours
    memoryService.pruneOld();
    const pruneInterval = setInterval(() => memoryService!.pruneOld(), 6 * 60 * 60 * 1000);
    pruneInterval.unref();
    log.info("Memory system enabled");
  }

  // Auto-login cache for Telegram sessions (no user JWT)
  let telegramStrapiJwt: string | undefined;

  // 5. Init gateway
  const gateway = new Gateway({
    port: config.gateway.port,
    token: config.gateway.token,
    corsOrigins: config.strapi?.corsOrigins,
    strapiBaseUrl: config.strapi?.baseUrl,
  });

  // 6. Setup dashboard + serve chart images
  setupDashboard(gateway.app);

  // Serve generated charts as static files
  const express = await import("express");
  gateway.app.use("/charts", express.default.static(chartsDir));

  // 7. Register gateway methods
  gateway.registerMethod("health", async () => ({
    ok: true,
    uptime: process.uptime(),
    provider: provider?.id ?? "none",
    strapi: config.strapi ? true : false,
  }));

  gateway.registerMethod("sessions.list", async () => {
    return sessionStore.list();
  });

  gateway.registerMethod("sessions.get", async (params: any) => {
    const session = await sessionStore.get(params.sessionKey);
    if (!session) throw new Error("Session not found");
    const entries = await transcript.read(session.sessionId);
    return { session, transcript: entries };
  });

  // chat.send now receives the WebSocket to extract Strapi user context
  gateway.registerMethod("chat.send", async (params: any, ws?: AuthenticatedWebSocket) => {
    if (!provider) throw new Error("No AI provider configured");
    const { text } = params as { text: string };

    // Determine session key and context from auth
    let sessionKey: string;
    let channel: string;
    let displayName: string;
    let strapiJwt: string | undefined;

    if (ws?.strapiUser) {
      // HRM user authenticated via Strapi JWT
      const user = ws.strapiUser;
      sessionKey = `hrm:${user.id}`;
      channel = "hrm";
      displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      strapiJwt = ws.strapiJwt;
    } else {
      // Dashboard/gateway token user
      sessionKey = (params as any).sessionKey ?? "dashboard:anonymous";
      channel = "dashboard";
      displayName = "Dashboard User";
    }

    const result = await processMessage(sessionKey, channel, text, displayName, strapiJwt);
    return { text: result.text, usage: result.usage };
  });

  // 8. Reply pipeline
  const replyPipeline = new ReplyPipeline();

  // 9. Message handler
  async function processMessage(
    sessionKey: string,
    channel: string,
    text: string,
    displayName?: string,
    strapiJwt?: string,
  ): Promise<AgentRunResult> {
    const session = await sessionStore.getOrCreate(sessionKey, channel, displayName);

    if (!provider) {
      return {
        text: "Hello! Nexus is running, but no AI provider is configured yet.",
        usage: { inputTokens: 0, outputTokens: 0 },
        iterations: 0,
        toolCalls: [],
        aborted: false,
      };
    }

    // Handle commands
    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      if (cmd === "/new") {
        await transcript.clear(session.sessionId);
        await sessionStore.update(sessionKey, {
          inputTokens: 0,
          outputTokens: 0,
          updatedAt: Date.now(),
        });
        return {
          text: "Session reset. Starting fresh.",
          usage: { inputTokens: 0, outputTokens: 0 },
          iterations: 0,
          toolCalls: [],
          aborted: false,
        };
      }
      if (cmd === "/stop") {
        const controller = activeRuns.get(sessionKey);
        if (controller) {
          controller.abort();
          activeRuns.delete(sessionKey);
        }
        return {
          text: "Stopped current operation.",
          usage: { inputTokens: 0, outputTokens: 0 },
          iterations: 0,
          toolCalls: [],
          aborted: true,
        };
      }
      if (cmd === "/model") {
        const newModel = text.split(" ")[1];
        if (newModel) {
          await sessionStore.update(sessionKey, { model: newModel, updatedAt: Date.now() });
          return {
            text: `Model switched to ${newModel}.`,
            usage: { inputTokens: 0, outputTokens: 0 },
            iterations: 0,
            toolCalls: [],
            aborted: false,
          };
        }
      }
    }

    // Save user message to transcript
    await transcript.append(session.sessionId, {
      role: "user",
      content: text,
      timestamp: Date.now(),
    });

    // Load history
    const entries = await transcript.read(session.sessionId);
    const messages: Message[] = entries
      .filter((e) => e.role === "user" || e.role === "assistant")
      .map((e) => ({
        role: e.role as "user" | "assistant",
        content: e.content,
      }));

    // Inject current datetime and memories into the latest user message (keeps system prompt cacheable)
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === "user") {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

        let prefix = `[${dateStr}, ${timeStr}]`;

        // Inject user memories
        if (memoryService) {
          const memories = memoryService.getMemories(sessionKey);
          if (memories.length > 0) {
            const memStr = memories.map((m) => m.content).join(" | ");
            prefix += `\n[Memory: ${memStr}]`;
          }
        }

        last.content = `${prefix}\n${last.content}`;
      }
    }

    // Auto-login for Telegram sessions without a JWT
    if (channel === "telegram" && !strapiJwt && config.strapi) {
      if (!telegramStrapiJwt) {
        try {
          const authRes = await fetch(`${config.strapi.baseUrl}/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: "admin@sidcorp.co", password: "Falconx@@123" }),
          });
          if (authRes.ok) {
            const authData = (await authRes.json()) as { jwt?: string };
            telegramStrapiJwt = authData.jwt;
            log.info("Telegram auto-login successful");
          }
        } catch (err) {
          log.warn("Telegram auto-login failed", { error: err });
        }
      }
      strapiJwt = telegramStrapiJwt;
    }

    // Build tool set for this session
    const sessionTools: AgentTool[] = [...baseTools, chartTool, codeRunTool];
    if (memoryTool) sessionTools.push(memoryTool);
    if (config.strapi && (channel === "hrm" || channel === "telegram" || strapiJwt)) {
      sessionTools.push(...hrmTools);
    }
    // Raw fallback
    if (strapiTool && (channel === "hrm" || strapiJwt)) {
      sessionTools.push(strapiTool);
    }

    // Run agent
    const controller = new AbortController();
    activeRuns.set(sessionKey, controller);

    const model = session.model ?? defaultModel;

    const result = await runAgent({
      provider,
      model,
      messages,
      tools: sessionTools,
      systemPromptParams: {
        customPrompt: config.agent.systemPrompt,
        channel,
        sessionKey,
        tools: sessionTools.map((t) => t.name),
        workspaceDir: join(dataDir, "workspace"),
      },
      maxContextTokens: config.agent.maxContextTokens,
      signal: controller.signal,
      onEvent: (event: StreamEvent) => {
        gateway.broadcast("agent", { sessionKey, ...event });
      },
      strapiJwt,
    });

    activeRuns.delete(sessionKey);

    // Save assistant response
    if (result.text) {
      await transcript.append(session.sessionId, {
        role: "assistant",
        content: result.text,
        timestamp: Date.now(),
      });
    }

    // Async memory extraction (non-blocking)
    if (memoryService && provider && result.text) {
      extractMemories(provider, model, messages, sessionKey, memoryService).catch(() => {});
    }

    // Update token counts
    await sessionStore.update(sessionKey, {
      inputTokens: session.inputTokens + result.usage.inputTokens,
      outputTokens: session.outputTokens + result.usage.outputTokens,
      updatedAt: Date.now(),
    });

    return result;
  }

  // 10. Channel setup
  const channelRegistry = new ChannelRegistry();

  // Debouncer
  const debouncer = new MessageDebouncer(1500, async (sessionKey, msgs) => {
    const combined = msgs.map((m) => m.text).join("\n");
    const channel = msgs[0].channel;
    const from = msgs[0].from;
    const displayName = (msgs[0].raw as any)?.from?.first_name;

    try {
      const channelPlugin = channelRegistry.get(channel);
      channelPlugin?.sendTyping?.(from);

      const result = await processMessage(sessionKey, channel, combined, displayName);

      if (result.text && channelPlugin) {
        await replyPipeline.deliver(channelPlugin, from, result.text);
      }
    } catch (err) {
      log.error("Error processing message", { error: err, sessionKey });
      const channelPlugin = channelRegistry.get(channel);
      if (channelPlugin) {
        await channelPlugin.send(from, "Sorry, an error occurred while processing your message.").catch(() => {});
      }
    }
  });

  // Telegram
  if (config.channels.telegram) {
    const telegramPlugin = new TelegramPlugin();
    channelRegistry.register(telegramPlugin);

    const onMessage = (msg: NormalizedMessage) => {
      const sessionKey = `telegram:${msg.from}`;
      debouncer.push(sessionKey, msg);
    };

    await telegramPlugin.start(
      {
        token: config.channels.telegram.token,
        allowFrom: config.channels.telegram.allowFrom,
        dmPolicy: config.channels.telegram.dmPolicy,
      },
      onMessage,
    );

    log.info("Telegram channel started");
  }

  // 11. Start gateway
  await gateway.start();
  log.info(`Gateway listening on port ${config.gateway.port}`);
  if (config.strapi) {
    log.info(`Strapi integration enabled: ${config.strapi.baseUrl}`);
  }

  // 12. Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");

    for (const [key, controller] of activeRuns) {
      controller.abort();
    }
    activeRuns.clear();

    debouncer.destroy();
    await channelRegistry.stopAll();
    await gateway.stop();
    await sessionStore.save();
    memoryService?.close();

    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("Fatal error", { error: err });
  process.exit(1);
});

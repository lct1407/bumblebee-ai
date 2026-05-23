const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

function getLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return env as LogLevel;
  return "info";
}

function log(level: LogLevel, component: string, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[getLogLevel()]) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };
  if (data !== undefined) entry.data = data;

  const line = JSON.stringify(entry);
  const method = level === "debug" ? "debug" : level === "warn" ? "warn" : level === "error" ? "error" : "log";
  console[method](line);
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(component: string): Logger {
  return {
    debug: (message, data?) => log("debug", component, message, data),
    info: (message, data?) => log("info", component, message, data),
    warn: (message, data?) => log("warn", component, message, data),
    error: (message, data?) => log("error", component, message, data),
  };
}

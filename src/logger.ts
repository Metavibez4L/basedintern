export type LogLevel = "debug" | "info" | "warn" | "error";

function ts() {
  return new Date().toISOString();
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta)
};

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const base = { ts: ts(), level, msg };
  const out = meta ? { ...base, ...meta } : base;
  // Keep it simple: JSON line logs.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out));
}


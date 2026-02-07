import http from "node:http";
import { URL } from "node:url";

import { logger } from "../logger.js";
import { TTLCache } from "../utils.js";

// ============================================================
// ACTION LOG RING BUFFER (for mini app /api/feed)
// Persists to disk on every write for crash resilience.
// ============================================================

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ActionLogEntry = {
  type: "trade" | "lp" | "social" | "news";
  timestamp: number;
  summary: string;
  txHash?: string;
  platform?: string;
};

const ACTION_LOG_MAX = 50;
let actionLog: ActionLogEntry[] = [];
let actionLogLoaded = false;

function actionLogPath(): string {
  const fromEnv = process.env.STATE_PATH?.trim();
  const stateDir = fromEnv && fromEnv.length > 0
    ? path.dirname(path.resolve(process.cwd(), fromEnv))
    : path.resolve(process.cwd(), "data");
  return path.join(stateDir, "action_log.json");
}

async function loadActionLog(): Promise<void> {
  if (actionLogLoaded) return;
  try {
    const raw = await readFile(actionLogPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      actionLog = parsed.slice(0, ACTION_LOG_MAX);
    }
  } catch {
    // File doesn't exist yet or is corrupted — start fresh
    actionLog = [];
  }
  actionLogLoaded = true;
}

// Debounced persistence — avoid disk writes on every single recordAction call
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.dirname(actionLogPath()), { recursive: true });
      await writeFile(actionLogPath(), JSON.stringify(actionLog), "utf8");
    } catch (err) {
      // Non-critical: log failure shouldn't break the agent
    }
  }, 2000); // 2s debounce
}

export function recordAction(entry: ActionLogEntry): void {
  actionLog.unshift(entry); // newest first
  if (actionLog.length > ACTION_LOG_MAX) actionLog.pop();
  schedulePersist();
}

export async function getActionLog(): Promise<ActionLogEntry[]> {
  await loadActionLog();
  return [...actionLog];
}

// ============================================================
// MINI APP API DATA PROVIDERS
// ============================================================

export type MiniAppDataProviders = {
  getAgentStats: () => Promise<{
    status: "live" | "offline";
    lastTradeAt: number | null;
    tradesToday: number;
    lpTvlWei: string | null;
    lpSharePercent: number | null;
    socialPostsToday: number;
    uptime: number;
    dryRun: boolean;
  }>;
  getPoolData: () => Promise<{
    tvlWei: string;
    reserve0: string;
    reserve1: string;
    internPrice: string;
    poolAddress: string;
  } | null>;
  getTokenData: () => Promise<{
    price: string;
    totalSupply: string;
    symbol: string;
    decimals: number;
  } | null>;
};

export type ControlServerOptions = {
  enabled: boolean;
  bind: string;
  port: number;
  token: string | null;
  getStatus: () => Promise<unknown>;
  requestTick: (reason: string) => { accepted: boolean; message: string };
  miniAppData?: MiniAppDataProviders;
};

function readAuthBearer(req: http.IncomingMessage): string | null {
  const v = req.headers.authorization;
  if (!v) return null;
  const m = /^Bearer\s+(.+)$/i.exec(v);
  return m ? m[1] : null;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(json);
}

function sendText(res: http.ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

export function startControlServer(opts: ControlServerOptions): { close: () => Promise<void> } {
  if (!opts.enabled) {
    return {
      close: async () => {
        // no-op
      }
    };
  }

  if (!opts.token || opts.token.trim().length < 16) {
    throw new Error("CONTROL_TOKEN must be set (>= 16 chars) when CONTROL_ENABLED=true");
  }

  // TTL caches for mini app endpoints — prevents fresh RPC calls on every request
  const statsCache = new TTLCache<string, unknown>(15_000);   // 15s TTL
  const poolCache = new TTLCache<string, unknown>(30_000);    // 30s TTL (RPC-heavy)
  const tokenCache = new TTLCache<string, unknown>(60_000);   // 60s TTL (rarely changes)

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      // CORS for mini app (public read-only endpoints)
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        return res.end();
      }

      // ---- Public endpoints (no auth) ----

      if (u.pathname === "/healthz") {
        return sendJson(res, 200, { ok: true });
      }

      // Mini App API: public read-only endpoints (with TTL caching)
      if (req.method === "GET" && u.pathname === "/api/stats" && opts.miniAppData) {
        let stats = statsCache.get("stats");
        if (!stats) {
          stats = await opts.miniAppData.getAgentStats();
          statsCache.set("stats", stats);
        }
        return sendJson(res, 200, stats);
      }

      if (req.method === "GET" && u.pathname === "/api/pool" && opts.miniAppData) {
        let pool = poolCache.get("pool");
        if (pool === undefined) {
          pool = await opts.miniAppData.getPoolData();
          if (pool) poolCache.set("pool", pool);
        }
        if (!pool) return sendJson(res, 503, { error: "pool data unavailable" });
        return sendJson(res, 200, pool);
      }

      if (req.method === "GET" && u.pathname === "/api/feed") {
        const feed = await getActionLog();
        return sendJson(res, 200, feed);
      }

      if (req.method === "GET" && u.pathname === "/api/token" && opts.miniAppData) {
        let token = tokenCache.get("token");
        if (token === undefined) {
          token = await opts.miniAppData.getTokenData();
          if (token) tokenCache.set("token", token);
        }
        if (!token) return sendJson(res, 503, { error: "token data unavailable" });
        return sendJson(res, 200, token);
      }

      // ---- Protected endpoints (require auth) ----

      const bearer = readAuthBearer(req);
      if (!bearer || bearer !== opts.token) {
        res.setHeader("www-authenticate", "Bearer");
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }

      if (req.method === "GET" && u.pathname === "/status") {
        const status = await opts.getStatus();
        return sendJson(res, 200, { ok: true, status });
      }

      if (req.method === "POST" && u.pathname === "/tick") {
        const reason = u.searchParams.get("reason") ?? "manual";
        const r = opts.requestTick(reason);
        return sendJson(res, r.accepted ? 202 : 409, { ok: r.accepted, message: r.message });
      }

      return sendText(res, 404, "not found");
    } catch (err) {
      logger.warn("control server request failed", { error: err instanceof Error ? err.message : String(err) });
      return sendJson(res, 500, { ok: false, error: "internal" });
    }
  });

  server.listen(opts.port, opts.bind, () => {
    logger.info("control server listening", { bind: opts.bind, port: opts.port });
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}

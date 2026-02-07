import http from "node:http";
import { URL } from "node:url";

import { logger } from "../logger.js";

// ============================================================
// ACTION LOG RING BUFFER (for mini app /api/feed)
// ============================================================

export type ActionLogEntry = {
  type: "trade" | "lp" | "social" | "news";
  timestamp: number;
  summary: string;
  txHash?: string;
  platform?: string;
};

const ACTION_LOG_MAX = 50;
const actionLog: ActionLogEntry[] = [];

export function recordAction(entry: ActionLogEntry): void {
  actionLog.unshift(entry); // newest first
  if (actionLog.length > ACTION_LOG_MAX) actionLog.pop();
}

export function getActionLog(): ActionLogEntry[] {
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

      // Mini App API: public read-only endpoints
      if (req.method === "GET" && u.pathname === "/api/stats" && opts.miniAppData) {
        const stats = await opts.miniAppData.getAgentStats();
        return sendJson(res, 200, stats);
      }

      if (req.method === "GET" && u.pathname === "/api/pool" && opts.miniAppData) {
        const pool = await opts.miniAppData.getPoolData();
        if (!pool) return sendJson(res, 503, { error: "pool data unavailable" });
        return sendJson(res, 200, pool);
      }

      if (req.method === "GET" && u.pathname === "/api/feed") {
        return sendJson(res, 200, getActionLog());
      }

      if (req.method === "GET" && u.pathname === "/api/token" && opts.miniAppData) {
        const token = await opts.miniAppData.getTokenData();
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

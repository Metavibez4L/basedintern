import http from "node:http";
import { URL } from "node:url";

import { logger } from "../logger.js";

export type ControlServerOptions = {
  enabled: boolean;
  bind: string;
  port: number;
  token: string | null;
  getStatus: () => Promise<unknown>;
  requestTick: (reason: string) => { accepted: boolean; message: string };
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

      if (u.pathname === "/healthz") {
        return sendJson(res, 200, { ok: true });
      }

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

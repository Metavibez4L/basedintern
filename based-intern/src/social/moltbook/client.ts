import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { redactCookieHeader, redactToken, safeErrorMessage } from "./redact.js";

type SkillEndpoint = { method: string; path: string; query?: Record<string, string> };

type SkillMapping = {
  baseUrl: string;
  requiredHost?: string;
  auth?: {
    modes?: Array<"bearer" | "apiKey" | "cookie">;
    headerName?: string;
    scheme?: string;
  };
  headers?: Record<string, string>;
  endpoints?: Record<string, SkillEndpoint>;
  rateLimits?: {
    postCooldownMinutes?: number;
    commentCooldownSeconds?: number;
  };
  limits?: {
    postContentMaxChars?: number;
  };
};

type CookieFile = { cookie: string } | { cookies: Array<{ name: string; value: string }> };

type SessionFile = {
  api_key?: string;
  apiKey?: string;
  claim_url?: string;
  claimUrl?: string;
  verification_code?: string;
  verificationCode?: string;
  agent_name?: string;
  agentName?: string;
  savedAt?: string;
};

export type MoltbookAuth =
  | { mode: "bearer" | "apiKey"; apiKey: string }
  | { mode: "cookie"; cookie: string };

export type MoltbookClient = {
  loadSkill(): Promise<SkillMapping>;
  loadAuth(): Promise<MoltbookAuth>;
  saveAuth(auth: MoltbookAuth): Promise<void>;
  saveRegistration(args: {
    apiKey: string;
    claimUrl?: string;
    verificationCode?: string;
    agentName?: string;
  }): Promise<void>;
  registerAgent(args: { name: string; description?: string }): Promise<any>;
  getStatus(): Promise<any>;
  whoami(): Promise<any>;
  getProfileByName(name: string): Promise<any>;
  getProfileMe(): Promise<any>;
  updateProfile(args: { description?: string; metadata?: any }): Promise<any>;
  createPost(args: { submolt?: string; title?: string; content?: string; url?: string }): Promise<any>;
  getTimeline(args?: { sort?: "hot" | "new" | "top" | "rising"; limit?: number; submolt?: string }): Promise<any>;
  request<T = any>(args: { method: string; path: string; query?: Record<string, any>; body?: any }): Promise<T>;
};

function resolveFromCwd(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function mustBeCanonicalMoltbookBaseUrl(baseUrl: string): void {
  const u = new URL(baseUrl);
  if (u.protocol !== "https:") throw new Error("Moltbook base URL must use https");
  if (u.hostname !== "www.moltbook.com") {
    throw new Error("Moltbook base URL must use www.moltbook.com (redirects can strip Authorization)");
  }
  if (!u.pathname.startsWith("/api/v1")) {
    throw new Error("Moltbook base URL must point at /api/v1");
  }
}

async function readJsonIfExists(p: string): Promise<any | null> {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Sanitize a cookie name or value to prevent header injection and malformed cookies.
 * Per RFC 6265, cookie values should not contain control chars, semicolons, or commas.
 * We also trim whitespace for safety.
 */
function sanitizeCookiePart(s: string): string {
  // Remove control characters (0x00-0x1F and 0x7F)
  // Remove semicolons (separates cookie pairs)
  // Remove commas (can confuse some parsers)
  // Trim whitespace
  return s
    .replace(/[\x00-\x1F\x7F;,"\\]/g, "")
    .trim();
}

function cookiesArrayToHeader(cookies: Array<{ name: string; value: string }>): string {
  const pairs = cookies
    .filter((c) => c && typeof c.name === "string" && typeof c.value === "string" && c.name.length > 0)
    .map((c) => {
      const sanitizedName = sanitizeCookiePart(c.name);
      const sanitizedValue = sanitizeCookiePart(c.value);
      // Skip if name became empty after sanitization
      if (!sanitizedName) return null;
      return `${sanitizedName}=${sanitizedValue}`;
    })
    .filter((pair): pair is string => pair !== null);
  return pairs.join("; ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterMs(base: number): number {
  const j = Math.floor(Math.random() * 250);
  return base + j;
}

function backoffMs(attempt: number): number {
  // 0.5s, 1s, 2s
  const base = 500 * Math.pow(2, Math.max(0, attempt - 1));
  return jitterMs(Math.min(base, 4000));
}

function parseRetryAfterMs(body: any): number | null {
  const secs = body?.retry_after_seconds;
  const mins = body?.retry_after_minutes;
  if (typeof secs === "number" && secs > 0) return Math.floor(secs * 1000);
  if (typeof mins === "number" && mins > 0) return Math.floor(mins * 60_000);
  return null;
}

function parseRetryAfterHeaderMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;

  // Most servers use seconds, but some use ms. Heuristic: if it's huge, assume ms.
  if (n > 60_000) return Math.floor(n);
  return Math.floor(n * 1000);
}

export class MoltbookRateLimitedError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`moltbook rate limited; retry after ${retryAfterMs}ms`);
    this.name = "MoltbookRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

async function ensureParentDir(p: string): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
}

async function bestEffortRestrictPermissions(p: string): Promise<void> {
  // On Windows this is generally a no-op; on POSIX it helps prevent accidental disclosure.
  try {
    if (process.platform !== "win32") {
      await chmod(p, 0o600);
    }
  } catch {
    // ignore
  }
}

export function createMoltbookClient(cfg: AppConfig): MoltbookClient {
  const skillJsonPath = resolveFromCwd("data/moltbook/skill.json");

  async function loadSkill(): Promise<SkillMapping> {
    const skill = (await readJsonIfExists(skillJsonPath)) as SkillMapping | null;
    const baseUrl = (skill?.baseUrl || cfg.MOLTBOOK_BASE_URL).trim();
    mustBeCanonicalMoltbookBaseUrl(baseUrl);

    return {
      baseUrl,
      requiredHost: skill?.requiredHost || "www.moltbook.com",
      auth: skill?.auth || { headerName: "Authorization", scheme: "Bearer", modes: ["bearer", "apiKey"] },
      headers: skill?.headers || { Accept: "application/json" },
      endpoints: skill?.endpoints || {},
      rateLimits: skill?.rateLimits || { postCooldownMinutes: 30, commentCooldownSeconds: 20 },
      limits: skill?.limits || {}
    };
  }

  async function loadAuth(): Promise<MoltbookAuth> {
    const mode = cfg.MOLTBOOK_AUTH_MODE;

    if (mode === "cookie") {
      const p = resolveFromCwd(cfg.MOLTBOOK_COOKIE_PATH);
      const parsed = (await readJsonIfExists(p)) as CookieFile | null;
      if (!parsed) {
        throw new Error(`missing cookie file at ${cfg.MOLTBOOK_COOKIE_PATH}`);
      }
      if ((parsed as any).cookie && typeof (parsed as any).cookie === "string") {
        return { mode: "cookie", cookie: (parsed as any).cookie };
      }
      if (Array.isArray((parsed as any).cookies)) {
        return { mode: "cookie", cookie: cookiesArrayToHeader((parsed as any).cookies) };
      }
      throw new Error("unrecognized cookie file format; expected {cookie} or {cookies: [...]} ");
    }

    // bearer/apiKey
    const sessionPath = resolveFromCwd(cfg.MOLTBOOK_SESSION_PATH);
    const session = (await readJsonIfExists(sessionPath)) as SessionFile | null;
    const key = (session?.api_key || session?.apiKey || cfg.MOLTBOOK_API_KEY || "").trim();
    if (!key) {
      throw new Error(
        `missing Moltbook API key. Set MOLTBOOK_API_KEY or run the CLI to write ${cfg.MOLTBOOK_SESSION_PATH}`
      );
    }
    return { mode, apiKey: key };
  }

  async function saveAuth(auth: MoltbookAuth): Promise<void> {
    if (auth.mode === "cookie") {
      const p = resolveFromCwd(cfg.MOLTBOOK_COOKIE_PATH);
      await ensureParentDir(p);
      await writeFile(p, JSON.stringify({ cookie: auth.cookie }, null, 2), "utf8");
      await bestEffortRestrictPermissions(p);
      return;
    }

    await saveRegistration({ apiKey: auth.apiKey });
  }

  async function saveRegistration(args: {
    apiKey: string;
    claimUrl?: string;
    verificationCode?: string;
    agentName?: string;
  }): Promise<void> {
    const p = resolveFromCwd(cfg.MOLTBOOK_SESSION_PATH);
    await ensureParentDir(p);

    const existing = (await readJsonIfExists(p)) as SessionFile | null;
    const payload: SessionFile = {
      ...(existing || {}),
      api_key: args.apiKey,
      savedAt: new Date().toISOString()
    };

    if (typeof args.claimUrl === "string" && args.claimUrl.trim()) payload.claim_url = args.claimUrl;
    if (typeof args.verificationCode === "string" && args.verificationCode.trim()) {
      payload.verification_code = args.verificationCode;
    }
    if (typeof args.agentName === "string" && args.agentName.trim()) payload.agent_name = args.agentName;

    await writeFile(p, JSON.stringify(payload, null, 2), "utf8");
    await bestEffortRestrictPermissions(p);
  }

  async function request<T>(args: {
    method: string;
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: any;
    isForm?: boolean;
  }): Promise<T> {
    const skill = await loadSkill();
    const auth = await loadAuth();

    const baseUrl = skill.baseUrl;
    const base = new URL(baseUrl);

    // Construct URL
    const url = new URL(args.path.replace(/^\//, ""), base.href.endsWith("/") ? base.href : base.href + "/");
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    // Extra safety: never send secrets to the wrong host.
    if (url.hostname !== "www.moltbook.com") {
      throw new Error(`refusing to send Moltbook credentials to non-canonical host: ${url.hostname}`);
    }

    const headers: Record<string, string> = {
      ...(skill.headers || {}),
      "User-Agent": cfg.MOLTBOOK_USER_AGENT
    };

    if (auth.mode === "cookie") {
      headers.Cookie = auth.cookie;
    } else {
      headers.Authorization = `Bearer ${auth.apiKey}`;
    }

    let body: string | undefined;
    if (args.body !== undefined && args.body !== null) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args.body);
    }

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method: args.method,
          headers,
          body
        });
      } catch (err) {
        logger.warn("moltbook.request network error", {
          method: args.method,
          path: args.path,
          attempt,
          error: safeErrorMessage(err)
        });
        if (attempt === maxAttempts) throw err;
        await sleep(backoffMs(attempt));
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text().catch(() => "");
      const parsed = contentType.includes("application/json") ? safeJsonParse(raw) : null;

      if (res.status === 401 || res.status === 403) {
        logger.error("moltbook auth error", {
          method: args.method,
          path: args.path,
          status: res.status,
          hint: "Check MOLTBOOK_API_KEY/session.json and ensure you only use https://www.moltbook.com/api/v1"
        });
        throw new Error(`moltbook auth failed (${res.status})`);
      }

      if (res.status === 429) {
        // IMPORTANT: do not sleep for long Retry-After windows here.
        // This call runs inside the agent tick; long sleeps would stall the whole loop.
        const retryMs = parseRetryAfterMs(parsed) ?? parseRetryAfterHeaderMs(res) ?? 10 * 60_000;
        logger.warn("moltbook rate limited", {
          method: args.method,
          path: args.path,
          status: res.status,
          attempt,
          retryAfterMs: retryMs
        });

        throw new MoltbookRateLimitedError(retryMs);
      }

      if (res.status >= 500 && res.status <= 599) {
        logger.warn("moltbook transient server error", {
          method: args.method,
          path: args.path,
          status: res.status,
          attempt
        });
        if (attempt === maxAttempts) {
          throw new Error(`moltbook server error (${res.status})`);
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      if (!res.ok) {
        // Never log secrets. Also avoid echoing raw response bodies (could include user data).
        logger.error("moltbook request failed", {
          method: args.method,
          path: args.path,
          status: res.status
        });
        throw new Error(`moltbook request failed (${res.status})`);
      }

      return (parsed ?? (raw as any)) as T;
    }

    throw new Error("moltbook request failed (unexpected)");
  }

  async function requestPublic<T>(args: { method: string; path: string; body?: any }): Promise<T> {
    const skill = await loadSkill();

    const base = new URL(skill.baseUrl);
    const url = new URL(args.path.replace(/^\//, ""), base.href.endsWith("/") ? base.href : base.href + "/");

    // Safety: never send anything (even unauthenticated) to the wrong host.
    if (url.hostname !== "www.moltbook.com") {
      throw new Error(`refusing to call Moltbook on non-canonical host: ${url.hostname}`);
    }

    const headers: Record<string, string> = {
      ...(skill.headers || {}),
      "User-Agent": cfg.MOLTBOOK_USER_AGENT
    };

    let body: string | undefined;
    if (args.body !== undefined && args.body !== null) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args.body);
    }

    const res = await fetch(url.toString(), { method: args.method, headers, body });
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text().catch(() => "");
    const parsed = contentType.includes("application/json") ? safeJsonParse(raw) : null;

    if (!res.ok) {
      logger.error("moltbook public request failed", {
        method: args.method,
        path: args.path,
        status: res.status
      });
      throw new Error(`moltbook request failed (${res.status})`);
    }

    return (parsed ?? (raw as any)) as T;
  }

  return {
    loadSkill,
    loadAuth,
    saveAuth,
    saveRegistration,

    async registerAgent(args: { name: string; description?: string }) {
      const name = args.name?.trim();
      if (!name) throw new Error("registerAgent: name required");
      const description = args.description?.trim();

      return await requestPublic<any>({
        method: "POST",
        path: "/agents/register",
        body: {
          name,
          description: description && description.length > 0 ? description : "Autonomous agent"
        }
      });
    },

    async getStatus() {
      return await request<any>({ method: "GET", path: "/agents/status" });
    },

    async whoami() {
      return await request<any>({ method: "GET", path: "/agents/me" });
    },

    async getProfileByName(name: string) {
      return await request<any>({ method: "GET", path: "/agents/profile", query: { name } });
    },

    async getProfileMe() {
      return await request<any>({ method: "GET", path: "/agents/me" });
    },

    async updateProfile(args: { description?: string; metadata?: any }) {
      return await request<any>({ method: "PATCH", path: "/agents/me", body: args });
    },

    async createPost(args: { submolt?: string; title?: string; content?: string; url?: string }) {
      const skill = await loadSkill();
      const max = skill.limits?.postContentMaxChars;
      if (typeof max === "number" && typeof args.content === "string" && args.content.length > max) {
        throw new Error(`post content too long (${args.content.length} > ${max})`);
      }

      return await request<any>({ method: "POST", path: "/posts", body: args });
    },

    async getTimeline(args?: { sort?: "hot" | "new" | "top" | "rising"; limit?: number; submolt?: string }) {
      const query: Record<string, string | number | undefined> = {
        sort: args?.sort,
        limit: args?.limit,
        submolt: args?.submolt
      };
      return await request<any>({ method: "GET", path: "/posts", query });
    },

    request
  };
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Avoid accidental secret printing if someone logs MoltbookAuth.
export function summarizeAuth(auth: MoltbookAuth): Record<string, string> {
  if (auth.mode === "cookie") {
    return { mode: "cookie", cookie: redactCookieHeader(auth.cookie) };
  }
  return { mode: auth.mode, apiKey: redactToken(auth.apiKey) };
}

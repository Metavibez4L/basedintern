import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { AgentState } from "../agent/state.js";
import { saveState } from "../agent/state.js";
import type { SocialPoster, SocialPostKind } from "./poster.js";

type XCreateTweetResponse =
  | { data: { id: string; text?: string } }
  | { errors: Array<{ message?: string; title?: string; detail?: string; type?: string }> };

/**
 * X API posting via OAuth 1.0a (user context).
 *
 * Hardened with:
 * - Circuit breaker (disable posting after 3 consecutive failures for 30 min)
 * - Idempotency (never post the same receipt twice)
 * - Rate-limit awareness (429 detection + exponential backoff)
 *
 * This works on Railway because it doesn't rely on a browser.
 * Requires paid X API access + OAuth 1.0a user access token/secret.
 */
export function createXPosterApi(cfg: AppConfig, state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): SocialPoster {
  let currentState = state;

  return {
    async post(text: string, kind?: SocialPostKind) {
      // Map kind to idempotencyKey: receipt -> 'receipt', others -> 'news'
      const idempotencyKey = !kind || kind === "receipt" ? "receipt" : "news";
      const out = await postTweetXApi(cfg, currentState, saveStateFn, {
        text,
        idempotencyKey
      });
      currentState = out.state;
    }
  };
}

export function createXNewsPosterApi(cfg: AppConfig, state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): SocialPoster {
  let currentState = state;
  return {
    async post(text: string, _kind?: SocialPostKind) {
      const out = await postTweetXApi(cfg, currentState, saveStateFn, {
        text,
        idempotencyKey: "news"
      });
      currentState = out.state;
    }
  };
}

type IdempotencyKey = "receipt" | "news";

function getLastPostedFingerprint(state: AgentState, key: IdempotencyKey): string | null {
  return key === "receipt" ? state.lastPostedReceiptFingerprint : state.lastPostedNewsFingerprint;
}

function setLastPostedFingerprint(state: AgentState, key: IdempotencyKey, fp: string): AgentState {
  if (key === "receipt") return { ...state, lastPostedReceiptFingerprint: fp };
  return { ...state, lastPostedNewsFingerprint: fp };
}

export async function postTweetXApi(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  args: { text: string; idempotencyKey: IdempotencyKey }
): Promise<{ posted: boolean; state: AgentState }> {
  const consumerKey = must(cfg.X_API_KEY, "X_API_KEY");
  const consumerSecret = must(cfg.X_API_SECRET, "X_API_SECRET");
  const accessToken = must(cfg.X_ACCESS_TOKEN, "X_ACCESS_TOKEN");
  const accessSecret = must(cfg.X_ACCESS_SECRET, "X_ACCESS_SECRET");

  let currentState = state;

  // Circuit breaker check
  if (isCircuitBreakerOpen(currentState)) {
    logger.warn("x_api posting disabled by circuit breaker", {
      disabledUntilMs: currentState.xApiCircuitBreakerDisabledUntilMs,
      failureCount: currentState.xApiFailureCount,
      channel: args.idempotencyKey
    });
    return { posted: false, state: currentState };
  }

  // Idempotency check
  const fingerprint = args.idempotencyKey === "receipt" ? computeReceiptFingerprint(args.text) : computeNewsTweetFingerprint(args.text);
  const last = getLastPostedFingerprint(currentState, args.idempotencyKey);
  if (fingerprint === last) {
    logger.info("x_api skipping duplicate post (already posted)", {
      channel: args.idempotencyKey,
      fingerprint: fingerprint.slice(0, 16) + "..."
    });
    return { posted: false, state: currentState };
  }

  const bodyText = truncateForTweet(args.text);
  if (bodyText !== args.text) {
    logger.warn("tweet text truncated to 280 chars", {
      originalLen: args.text.length,
      newLen: bodyText.length,
      channel: args.idempotencyKey
    });
  }

  const url = "https://api.twitter.com/2/tweets";
  const method = "POST";
  const payload = JSON.stringify({ text: bodyText });

  // Rate-limit aware retry with exponential backoff
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const authHeader = buildOAuth1Header({
      method,
      url,
      consumerKey,
      consumerSecret,
      accessToken,
      accessSecret
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: payload
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.warn("x_api network error", {
        attempt,
        channel: args.idempotencyKey,
        error: errMsg
      });

      if (attempt === maxAttempts) {
        currentState = await recordXApiFailure(currentState, saveStateFn);
      } else {
        const delayMs = retryDelayMs(attempt, false);
        await sleep(delayMs);
      }
      continue;
    }

    const raw = await res.text().catch(() => "");
    const parsed = safeJsonParse(raw) as XCreateTweetResponse | undefined;
    const isRateLimited = res.status === 429;
    const isTransientError = res.status >= 500 && res.status <= 599;

    if (isRateLimited || isTransientError) {
      const resetHeader = res.headers.get("x-rate-limit-reset");
      const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : null;

      logger.warn("x_api rate-limited or transient error", {
        attempt,
        status: res.status,
        channel: args.idempotencyKey,
        isRateLimited,
        resetAtMs: resetAt,
        body: summarizeXError(raw)
      });

      if (attempt === maxAttempts) {
        currentState = await recordXApiFailure(currentState, saveStateFn);
      } else {
        const delayMs = retryDelayMs(attempt, isRateLimited);
        logger.info("x_api retrying after backoff", {
          attempt,
          channel: args.idempotencyKey,
          delayMs
        });
        await sleep(delayMs);
      }
      continue;
    }

    if (!res.ok) {
      const summary = summarizeXError(raw);

      // Duplicate tweet is non-fatal; mark idempotency as satisfied.
      if (isDuplicateTweet(summary) || isDuplicateTweet(raw)) {
        logger.info("x_api rejected duplicate tweet; skipping", {
          channel: args.idempotencyKey,
          status: res.status,
          attempt,
          detail: summary
        });
        currentState = setLastPostedFingerprint(currentState, args.idempotencyKey, fingerprint);
        currentState = { ...currentState, xApiFailureCount: 0 };
        await saveStateFn(currentState);
        return { posted: true, state: currentState };
      }

      if (res.status === 401 || res.status === 403) {
        logger.error("x_api auth/permission error (check app permissions + regenerate user tokens)", {
          channel: args.idempotencyKey,
          status: res.status,
          attempt,
          detail: summary,
          fix:
            "Ensure your X app has Read+Write permissions, then regenerate X_ACCESS_TOKEN/X_ACCESS_SECRET for the posting account. " +
            "Also confirm you are using OAuth 1.0a user tokens (not the bearer token)."
        });
        currentState = await recordXApiFailure(currentState, saveStateFn);
        return { posted: false, state: currentState };
      }

      logger.error("x_api post failed", {
        channel: args.idempotencyKey,
        status: res.status,
        attempt,
        detail: summary
      });

      if (attempt === maxAttempts) {
        currentState = await recordXApiFailure(currentState, saveStateFn);
      }
      return { posted: false, state: currentState };
    }

    const tweetId = (parsed as any)?.data?.id;
    if (typeof tweetId !== "string" || !tweetId.trim()) {
      logger.error("x_api response missing tweet id", {
        channel: args.idempotencyKey,
        status: res.status,
        attempt,
        detail: summarizeXError(raw)
      });
      currentState = await recordXApiFailure(currentState, saveStateFn);
      return { posted: false, state: currentState };
    }

    const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
    logger.info("x_api posted successfully", {
      channel: args.idempotencyKey,
      attempt,
      tweetId,
      tweetUrl
    });

    currentState = setLastPostedFingerprint(currentState, args.idempotencyKey, fingerprint);
    currentState = { ...currentState, xApiFailureCount: 0, xApiCircuitBreakerDisabledUntilMs: null };
    await saveStateFn(currentState);
    return { posted: true, state: currentState };
  }

  logger.error("x_api exhausted retries for this tick", {
    channel: args.idempotencyKey,
    failureCount: currentState.xApiFailureCount
  });

  return { posted: false, state: currentState };
}

/**
 * Compute a fingerprint for receipt idempotency.
 * Includes: chain, action, tx hash (if present), wallet, and timestamp bucket (5-minute window).
 */
export function computeReceiptFingerprint(receiptText: string): string {
  return computeBucketedSha256(receiptText, 5);
}

export function computeNewsTweetFingerprint(text: string): string {
  return computeBucketedSha256(text, 5);
}

function computeBucketedSha256(text: string, bucketMinutes: number): string {
  const now = Math.floor(Date.now() / (bucketMinutes * 60 * 1000)) * (bucketMinutes * 60 * 1000);
  const bucket = new Date(now).toISOString();
  const data = text + "|" + bucket;
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Check if circuit breaker is open (X API temporarily disabled).
 */
function isCircuitBreakerOpen(state: AgentState): boolean {
  const disabledUntil = state.xApiCircuitBreakerDisabledUntilMs;
  if (!disabledUntil) return false;

  const now = Date.now();
  if (now < disabledUntil) {
    return true; // Still disabled
  }

  // Cooldown expired; breaker is closed
  return false;
}

/**
 * Record an X API failure and trigger circuit breaker if threshold reached.
 */
async function recordXApiFailure(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): Promise<AgentState> {
  const nextState: AgentState = { ...state };
  nextState.xApiFailureCount += 1;

  if (nextState.xApiFailureCount >= 3) {
    // Open circuit breaker for 30 minutes
    const cooldownMs = 30 * 60 * 1000;
    nextState.xApiCircuitBreakerDisabledUntilMs = Date.now() + cooldownMs;

    logger.warn("x_api circuit breaker opened after 3 consecutive failures", {
      disabledUntilMs: nextState.xApiCircuitBreakerDisabledUntilMs,
      cooldownMinutes: cooldownMs / 60 / 1000
    });
  }

  await saveStateFn(nextState);
  return nextState;
}

/**
 * Calculate retry delay with exponential backoff.
 * For rate-limited (429) errors, use longer delays.
 */
function retryDelayMs(attempt: number, isRateLimited: boolean): number {
  if (isRateLimited) {
    // Rate-limit specific backoff: 2min, 5min, 15min
    if (attempt === 1) return 2 * 60 * 1000;
    if (attempt === 2) return 5 * 60 * 1000;
    return 15 * 60 * 1000;
  }

  // Transient error backoff: faster recovery
  if (attempt === 1) return 1_000;
  if (attempt === 2) return 3_000;
  return 8_000;
}

function must(v: string | undefined, name: string): string {
  if (!v || !v.trim()) throw new Error(`${name} is required when SOCIAL_MODE=x_api`);
  return v;
}

function truncateForTweet(s: string): string {
  // X currently enforces 280 chars for plain text tweets.
  if (s.length <= 280) return s;
  const suffix = "…";
  return s.slice(0, 280 - suffix.length).trimEnd() + suffix;
}

function buildOAuth1Header(args: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: args.accessToken,
    oauth_version: "1.0"
  };

  const baseString = buildSignatureBaseString(args.method, args.url, oauthParams);
  const signingKey = `${rfc3986(args.consumerSecret)}&${rfc3986(args.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const header =
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k] ?? "")}"`)
      .join(", ");

  return header;
}

function buildSignatureBaseString(method: string, url: string, oauthParams: Record<string, string>): string {
  // For JSON body requests, OAuth 1.0a signature uses oauth params + query params (no JSON body params).
  const u = new URL(url);
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;

  const params: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(oauthParams)) params.push([k, v]);
  for (const [k, v] of u.searchParams.entries()) params.push([k, v]);

  params.sort(([ak, av], [bk, bv]) => (ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk)));
  const normalized = params.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join("&");

  return `${method.toUpperCase()}&${rfc3986(baseUrl)}&${rfc3986(normalized)}`;
}

function rfc3986(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function safeJsonParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function summarizeXError(raw: string): string {
  const parsed = safeJsonParse(raw) as any;
  const msg =
    parsed?.detail ??
    parsed?.title ??
    parsed?.message ??
    parsed?.errors?.[0]?.message ??
    parsed?.errors?.[0]?.detail ??
    parsed?.errors?.[0]?.title;
  if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 300);
  return raw.trim().slice(0, 300);
}

function isDuplicateTweet(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("duplicate") || m.includes("status is a duplicate");
}

function backoffMs(attempt: number): number {
  if (attempt <= 1) return 1_000;
  if (attempt === 2) return 3_000;
  return 8_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

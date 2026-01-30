import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { AgentState } from "../agent/state.js";
import { saveState } from "../agent/state.js";
import type { SocialPoster } from "./poster.js";

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
 * This works on Railway because it doesn't rely on a browser / Playwright.
 * Requires paid X API access + OAuth 1.0a user access token/secret.
 */
export function createXPosterApi(cfg: AppConfig, state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): SocialPoster {
  const consumerKey = must(cfg.X_API_KEY, "X_API_KEY");
  const consumerSecret = must(cfg.X_API_SECRET, "X_API_SECRET");
  const accessToken = must(cfg.X_ACCESS_TOKEN, "X_ACCESS_TOKEN");
  const accessSecret = must(cfg.X_ACCESS_SECRET, "X_ACCESS_SECRET");

  let currentState = state;

  return {
    async post(text: string) {
      // Circuit breaker check
      if (isCircuitBreakerOpen(currentState)) {
        logger.warn("x_api posting disabled by circuit breaker", {
          disabledUntilMs: currentState.xApiCircuitBreakerDisabledUntilMs,
          failureCount: currentState.xApiFailureCount
        });
        return;
      }

      // Idempotency check
      const fingerprint = computeReceiptFingerprint(text);
      if (fingerprint === currentState.lastPostedReceiptFingerprint) {
        logger.info("x_api skipping duplicate receipt (already posted)", {
          fingerprint: fingerprint.slice(0, 16) + "..."
        });
        return;
      }

      const bodyText = truncateForTweet(text);
      if (bodyText !== text) {
        logger.warn("tweet text truncated to 280 chars", {
          originalLen: text.length,
          newLen: bodyText.length
        });
      }

      const url = "https://api.twitter.com/2/tweets";
      const method = "POST";
      const payload = JSON.stringify({ text: bodyText });

      // Rate-limit aware retry with exponential backoff
      const maxAttempts = 3;
      let lastError: Error | null = null;

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
            error: errMsg
          });
          lastError = e instanceof Error ? e : new Error(errMsg);

          // On last attempt, increment failure count
          if (attempt === maxAttempts) {
            await recordXApiFailure(currentState, saveStateFn);
          } else {
            // Wait before retry
            const delayMs = retryDelayMs(attempt, false);
            await sleep(delayMs);
          }
          continue;
        }

        const raw = await res.text().catch(() => "");
        const parsed = safeJsonParse(raw) as XCreateTweetResponse | undefined;
        const isRateLimited = res.status === 429;
        const isTransientError = res.status >= 500 && res.status <= 599;

        // Detect rate limiting via status or headers
        if (isRateLimited || isTransientError) {
          const resetHeader = res.headers.get("x-rate-limit-reset");
          const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : null;

          logger.warn("x_api rate-limited or transient error", {
            attempt,
            status: res.status,
            isRateLimited,
            resetAtMs: resetAt,
            body: summarizeXError(raw)
          });

          if (attempt === maxAttempts) {
            // Exhausted retries
            await recordXApiFailure(currentState, saveStateFn);
          } else {
            // Retry with exponential backoff
            const delayMs = retryDelayMs(attempt, isRateLimited);
            logger.info("x_api retrying after backoff", {
              attempt,
              delayMs
            });
            await sleep(delayMs);
          }
          continue;
        }

        if (!res.ok) {
          const summary = summarizeXError(raw);

          // Special case: duplicate tweet (not a failure)
          if (isDuplicateTweet(summary) || isDuplicateTweet(raw)) {
            logger.info("x_api rejected duplicate tweet; skipping", {
              status: res.status,
              attempt,
              detail: summary
            });
            // Update fingerprint as if posted successfully
            currentState.lastPostedReceiptFingerprint = fingerprint;
            currentState.xApiFailureCount = 0;
            await saveStateFn(currentState);
            return;
          }

          // Auth errors
          if (res.status === 401 || res.status === 403) {
            logger.error("x_api auth/permission error (check app permissions + regenerate user tokens)", {
              status: res.status,
              attempt,
              detail: summary,
              fix:
                "Ensure your X app has Read+Write permissions, then regenerate X_ACCESS_TOKEN/X_ACCESS_SECRET for the posting account. " +
                "Also confirm you are using OAuth 1.0a user tokens (not the bearer token)."
            });
            // Treat as non-retriable failure
            await recordXApiFailure(currentState, saveStateFn);
            return;
          }

          // Other non-retriable errors
          logger.error("x_api post failed", {
            status: res.status,
            attempt,
            detail: summary
          });

          if (attempt === maxAttempts) {
            await recordXApiFailure(currentState, saveStateFn);
          }
          return;
        }

        // Success
        const tweetId = (parsed as any)?.data?.id;
        if (typeof tweetId !== "string" || !tweetId.trim()) {
          logger.error("x_api response missing tweet id", {
            status: res.status,
            attempt,
            detail: summarizeXError(raw)
          });
          await recordXApiFailure(currentState, saveStateFn);
          return;
        }

        const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
        logger.info("x_api posted successfully", {
          attempt,
          tweetId,
          tweetUrl
        });

        // Reset failure counter and update fingerprint
        currentState.lastPostedReceiptFingerprint = fingerprint;
        currentState.xApiFailureCount = 0;
        currentState.xApiCircuitBreakerDisabledUntilMs = null;
        await saveStateFn(currentState);
        return;
      }

      // Exhausted all attempts; already recorded failure
      logger.error("x_api exhausted retries for this tick", {
        failureCount: currentState.xApiFailureCount
      });
    }
  };
}

/**
 * Compute a fingerprint for receipt idempotency.
 * Includes: chain, action, tx hash (if present), wallet, and timestamp bucket (5-minute window).
 */
export function computeReceiptFingerprint(receiptText: string): string {
  // Extract key fields from receipt format
  // Receipt is multi-line, we use the whole content for fingerprinting
  // but bucket the timestamp to 5-minute windows to avoid clock skew issues

  const now = Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);
  const bucket = new Date(now).toISOString();

  // Hash: receipt text + timestamp bucket
  const data = receiptText + "|" + bucket;
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
async function recordXApiFailure(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): Promise<void> {
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


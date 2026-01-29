import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { SocialPoster } from "./poster.js";

type XCreateTweetResponse =
  | { data: { id: string; text?: string } }
  | { errors: Array<{ message?: string; title?: string; detail?: string; type?: string }> };

/**
 * X API posting via OAuth 1.0a (user context).
 *
 * This works on Railway because it doesn't rely on a browser / Playwright.
 * Requires paid X API access + OAuth 1.0a user access token/secret.
 */
export function createXPosterApi(cfg: AppConfig): SocialPoster {
  const consumerKey = must(cfg.X_API_KEY, "X_API_KEY");
  const consumerSecret = must(cfg.X_API_SECRET, "X_API_SECRET");
  const accessToken = must(cfg.X_ACCESS_TOKEN, "X_ACCESS_TOKEN");
  const accessSecret = must(cfg.X_ACCESS_SECRET, "X_ACCESS_SECRET");

  return {
    async post(text: string) {
      const bodyText = truncateForTweet(text);
      if (bodyText !== text) {
        logger.warn("tweet text truncated to 280 chars", { originalLen: text.length, newLen: bodyText.length });
      }

      const url = "https://api.twitter.com/2/tweets";
      const method = "POST";
      const payload = JSON.stringify({ text: bodyText });

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
          logger.warn("failed to post to X (x_api) due to network error", {
            attempt,
            error: e instanceof Error ? e.message : String(e)
          });
          await sleep(backoffMs(attempt));
          continue;
        }

        const raw = await res.text().catch(() => "");
        const parsed = safeJsonParse(raw) as XCreateTweetResponse | undefined;

        // Retry on 429 and transient 5xx.
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          logger.warn("X API temporary failure; will retry", {
            attempt,
            status: res.status,
            body: summarizeXError(raw)
          });
          await sleep(backoffMs(attempt));
          continue;
        }

        if (!res.ok) {
          // Non-retriable most of the time (401/403/400 etc). Log and keep the agent alive.
          const summary = summarizeXError(raw);
          if (isDuplicateTweet(summary) || isDuplicateTweet(raw)) {
            logger.info("X API rejected duplicate tweet; skipping", { status: res.status, attempt, detail: summary });
            return;
          }
          if (res.status === 401 || res.status === 403) {
            logger.error("X API auth/permission error (check app permissions + regenerate user tokens)", {
              status: res.status,
              attempt,
              detail: summary,
              fix:
                "Ensure your X app has Read+Write permissions, then regenerate X_ACCESS_TOKEN/X_ACCESS_SECRET for the posting account. " +
                "Also confirm you are using OAuth 1.0a user tokens (not the bearer token)."
            });
            return;
          }
          logger.error("X API post failed", { status: res.status, attempt, detail: summary });
          return;
        }

        const tweetId = (parsed as any)?.data?.id;
        if (typeof tweetId !== "string" || !tweetId.trim()) {
          logger.error("X API response missing tweet id", { status: res.status, attempt, detail: summarizeXError(raw) });
          return;
        }

        // Works without knowing the handle.
        const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
        logger.info("posted to X (x_api)", { attempt, tweetId, tweetUrl });
        return;
      }

      // If we exhausted retries, keep the agent alive but make it obvious.
      logger.error("giving up posting to X (x_api) for this tick", {});
    }
  };
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


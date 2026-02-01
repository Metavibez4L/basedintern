import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { logger } from "../logger.js";

/**
 * X Mentions Poller - Phase 1 (Intent Recognition Only)
 *
 * Reads tweets mentioning the bot account, parses commands, and posts safe responses.
 * NEVER executes trades or bypasses guardrails. Just acknowledges intent + explains constraints.
 */

export type MentionPollerContext = {
  cfg: AppConfig;
  state: AgentState;
  saveStateFn: (s: AgentState) => Promise<void>;
  userId?: string; // Cached authenticated user ID
  lastSuccessfulPollMs?: number;
};

/**
 * Supported commands and responses
 */
type CommandType = "help" | "status" | "buy" | "sell" | "why" | "unknown";

interface ParsedCommand {
  type: CommandType;
  rawText: string;
}

interface Mention {
  id: string;
  text: string;
  authorId: string;
}

interface MentionFingerprint {
  mentionId: string;
  command: CommandType;
  hash: string;
}

/**
 * Poll mentions and respond with safe, intent-focused replies.
 */
export async function pollMentionsAndRespond(ctx: MentionPollerContext): Promise<void> {
  try {
    // Check if X API credentials are available
    if (!ctx.cfg.X_API_KEY || !ctx.cfg.X_API_SECRET || !ctx.cfg.X_ACCESS_TOKEN || !ctx.cfg.X_ACCESS_SECRET) {
      logger.warn("x_mentions skipped: missing X API credentials", {});
      return;
    }

    // Fetch authenticated user ID if not cached
    if (!ctx.userId) {
      try {
        ctx.userId = await fetchAuthenticatedUserId(ctx.cfg);
        logger.info("x_mentions fetched authenticated user ID", { userId: ctx.userId });
      } catch (err) {
        logger.warn("x_mentions failed to fetch user ID", {
          error: err instanceof Error ? err.message : String(err)
        });
        return;
      }
    }

    // Fetch mentions timeline
    let mentions: Mention[];
    try {
      mentions = await fetchMentions(ctx.cfg, ctx.userId, ctx.state.lastSeenMentionId ?? undefined);
      logger.info("x_mentions fetched mentions", { count: mentions.length });
    } catch (err) {
      logger.warn("x_mentions failed to fetch mentions", {
        error: err instanceof Error ? err.message : String(err)
      });
      return;
    }

    if (mentions.length === 0) {
      logger.info("x_mentions no new mentions", {});
      return;
    }

    // Process each mention (newest first, but we track oldest seen for pagination)
    const respondedMentions: string[] = [];
    const repliedFingerprints = ctx.state.repliedMentionFingerprints ?? [];

    for (const mention of mentions) {
      const cmd = parseCommand(mention.text);
      const fingerprint = computeMentionFingerprint(mention.id, cmd.type);

      // Check if already replied
      if (repliedFingerprints.includes(fingerprint.hash)) {
        logger.info("x_mentions skipping duplicate mention", {
          mentionId: mention.id,
          command: cmd.type
        });
        continue;
      }

      // Compose and post reply
      const replyText = composeReply(cmd, ctx);
      try {
        const replyTweetId = await postReply(ctx.cfg, mention.id, replyText);
        logger.info("x_mentions posted reply", {
          mentionId: mention.id,
          command: cmd.type,
          replyId: replyTweetId
        });

        respondedMentions.push(mention.id);
        repliedFingerprints.push(fingerprint.hash);
      } catch (err) {
        logger.warn("x_mentions failed to post reply", {
          mentionId: mention.id,
          command: cmd.type,
          error: err instanceof Error ? err.message : String(err)
        });
        // Continue processing other mentions even if one fails
      }
    }

    // Update state: lastSeenMentionId (for pagination) and replied fingerprints (for dedup)
    if (mentions.length > 0) {
      const newestMentionId = mentions[0].id;
      ctx.state.lastSeenMentionId = newestMentionId;
      ctx.state.lastSuccessfulMentionPollMs = Date.now();

      // Keep last 20 fingerprints to avoid memory growth
      const maxFingerprints = 20;
      ctx.state.repliedMentionFingerprints = repliedFingerprints.slice(-maxFingerprints);

      await ctx.saveStateFn(ctx.state);
      logger.info("x_mentions updated state", {
        lastSeenMentionId: newestMentionId,
        repliedCount: respondedMentions.length,
        totalFingerprintsTracked: ctx.state.repliedMentionFingerprints.length
      });
    }
  } catch (err) {
    logger.error("x_mentions unexpected error", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Parse command from tweet text (case-insensitive, partial matching).
 */
export function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  // Check specific commands first to avoid false positives
  if (lower.includes("why")) {
    return { type: "why", rawText: text };
  }
  if (lower.includes("buy")) {
    return { type: "buy", rawText: text };
  }
  if (lower.includes("sell")) {
    return { type: "sell", rawText: text };
  }
  if (lower.includes("status") || lower.includes("bal")) {
    return { type: "status", rawText: text };
  }
  if (lower.includes("help") || lower.includes("?")) {
    return { type: "help", rawText: text };
  }

  return { type: "unknown", rawText: text };
}

/**
 * Compose a safe reply acknowledging the command without executing trades.
 */
export function composeReply(cmd: ParsedCommand, ctx: MentionPollerContext): string {
  const cfg = ctx.cfg;
  const dryRunStatus = cfg.DRY_RUN ? "🔒 DRY_RUN" : "🚨 LIVE";
  const tradingStatus = cfg.TRADING_ENABLED && !cfg.KILL_SWITCH ? "enabled" : "disabled";

  const baseReply = "based intern here.";

  switch (cmd.type) {
    case "help":
      return truncateForTweet(
        baseReply + " commands: status (check balances), buy/sell (intent noted but phase 1 no execute), why (explain guardrails), help (this). mode: " + dryRunStatus
      );

    case "status":
      return truncateForTweet(
        baseReply + " trading: " + tradingStatus + " | mode: " + dryRunStatus + " | chain: " + (cfg.CHAIN === "base-sepolia" ? "sepolia" : "base")
      );

    case "buy":
      return truncateForTweet(
        baseReply +
          " 💭 buy intent noted. phase 1 = no trade execution. status: trading " +
          tradingStatus +
          " | " +
          dryRunStatus
      );

    case "sell":
      return truncateForTweet(
        baseReply +
          " 💭 sell intent noted. phase 1 = no trade execution. status: trading " +
          tradingStatus +
          " | " +
          dryRunStatus
      );

    case "why":
      return truncateForTweet(
        baseReply +
          " guardrails: TRADING_ENABLED=" +
          cfg.TRADING_ENABLED +
          ", KILL_SWITCH=" +
          cfg.KILL_SWITCH +
          ", DRY_RUN=" +
          cfg.DRY_RUN +
          ". all must pass."
      );

    case "unknown":
      return truncateForTweet(
        baseReply + " didn't recognize that. try: status, buy, sell, why, or help. mode: " + dryRunStatus
      );

    default:
      return truncateForTweet(baseReply + " unknown command. mode: " + dryRunStatus);
  }
}

/**
 * Compute a deterministic fingerprint for a mention + command to avoid duplicate replies.
 */
export function computeMentionFingerprint(mentionId: string, commandType: CommandType): MentionFingerprint {
  const data = mentionId + "|" + commandType;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  return {
    mentionId,
    command: commandType,
    hash
  };
}

/**
 * Truncate reply text to 240 chars (leaving room for mentions).
 */
export function truncateForTweet(text: string): string {
  const maxLen = 240;
  if (text.length <= maxLen) return text;

  const suffix = "…";
  return text.slice(0, maxLen - suffix.length).trimEnd() + suffix;
}

/**
 * Fetch authenticated user ID using /2/users/me endpoint.
 */
async function fetchAuthenticatedUserId(cfg: AppConfig): Promise<string> {
  const consumerKey = cfg.X_API_KEY || "";
  const consumerSecret = cfg.X_API_SECRET || "";
  const accessToken = cfg.X_ACCESS_TOKEN || "";
  const accessSecret = cfg.X_ACCESS_SECRET || "";

  const url = "https://api.twitter.com/2/users/me";
  const authHeader = buildOAuth1Header({
    method: "GET",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessSecret
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch user ID: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) {
    throw new Error("No user ID in response");
  }

  return json.data.id;
}

/**
 * Fetch recent mentions of the authenticated user.
 * Uses pagination via since_id to only fetch new mentions.
 */
async function fetchMentions(cfg: AppConfig, userId: string, sinceId?: string): Promise<Mention[]> {
  const consumerKey = cfg.X_API_KEY || "";
  const consumerSecret = cfg.X_API_SECRET || "";
  const accessToken = cfg.X_ACCESS_TOKEN || "";
  const accessSecret = cfg.X_ACCESS_SECRET || "";

  let url = `https://api.twitter.com/2/users/${userId}/mentions?tweet.fields=created_at&expansions=author_id&max_results=100`;
  if (sinceId) {
    url += `&since_id=${sinceId}`;
  }

  const authHeader = buildOAuth1Header({
    method: "GET",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessSecret
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch mentions: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ id: string; text: string }>;
  };
  const mentions = json.data ?? [];

  // Return in descending order (newest first) for processing
  return mentions.reverse() as Mention[];
}

/**
 * Post a reply to a mention tweet.
 */
async function postReply(cfg: AppConfig, inReplyToTweetId: string, replyText: string): Promise<string> {
  const consumerKey = cfg.X_API_KEY || "";
  const consumerSecret = cfg.X_API_SECRET || "";
  const accessToken = cfg.X_ACCESS_TOKEN || "";
  const accessSecret = cfg.X_ACCESS_SECRET || "";

  const url = "https://api.twitter.com/2/tweets";
  const method = "POST";

  // X forbids duplicate Tweet content even across different reply threads.
  // Add a short deterministic suffix so replies to different mentions are not identical.
  const uniqueSuffix = ` ref:${inReplyToTweetId.slice(-6)}`;
  const uniqueText = truncateForTweet(replyText + uniqueSuffix);
  const payload = JSON.stringify({
    text: uniqueText,
    reply: {
      in_reply_to_tweet_id: inReplyToTweetId
    }
  });

  const authHeader = buildOAuth1Header({
    method,
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessSecret
  });

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: payload
  });

  if (!res.ok) {
    const body = await res.text();

    // If we already posted an identical reply in the past, treat this as satisfied idempotency.
    // This prevents spammy retry loops when multiple mentions arrive with the same command.
    if (res.status === 403 && /duplicate content/i.test(body)) {
      return `duplicate:${inReplyToTweetId}`;
    }

    throw new Error(`Failed to post reply: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) {
    throw new Error("No tweet ID in response");
  }

  return json.data.id;
}

/**
 * OAuth 1.0a header builder (reused from x_api.ts).
 */
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

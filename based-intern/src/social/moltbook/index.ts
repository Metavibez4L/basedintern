import crypto from "node:crypto";
import type { AppConfig } from "../../config.js";
import type { AgentState } from "../../agent/state.js";
import { logger } from "../../logger.js";
import type { SocialPoster, SocialPostKind } from "../poster.js";
import { createMoltbookClient, MoltbookRateLimitedError, MoltbookSuspendedError } from "./client.js";
import { formatViralPost } from "../moltbook_engagement.js";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function minutesToMs(m: number): number {
  return Math.floor(m * 60_000);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

function isDisabledByCircuitBreaker(state: AgentState): boolean {
  const until = (state as any).moltbookCircuitBreakerDisabledUntilMs as number | null | undefined;
  return typeof until === "number" && until > Date.now();
}

async function recordFailure(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): Promise<AgentState> {
  const failureCount = ((state as any).moltbookFailureCount as number | undefined) ?? 0;
  const nextCount = failureCount + 1;

  // After 3 consecutive failures, disable posting for 30 minutes.
  const disabledUntilMs = nextCount >= 3 ? Date.now() + minutesToMs(30) : null;

  const next: AgentState = {
    ...(state as any),
    moltbookFailureCount: nextCount,
    moltbookCircuitBreakerDisabledUntilMs: disabledUntilMs
  };

  await saveStateFn(next);
  return next;
}

async function recordRateLimited(
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  retryAfterMs: number
): Promise<AgentState> {
  // Keep this bounded to avoid accidentally disabling forever.
  const boundedRetryMs = clamp(Math.floor(retryAfterMs), minutesToMs(1), minutesToMs(180));
  const disabledUntilMs = Date.now() + boundedRetryMs;

  const next: AgentState = {
    ...(state as any),
    // Rate limits aren't "failures"; don't trip the 3-strikes breaker.
    moltbookFailureCount: 0,
    moltbookCircuitBreakerDisabledUntilMs: disabledUntilMs
  };

  await saveStateFn(next);
  return next;
}

async function recordReceiptSuccess(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>, fingerprint: string): Promise<AgentState> {
  const next: AgentState = {
    ...(state as any),
    moltbookFailureCount: 0,
    moltbookCircuitBreakerDisabledUntilMs: null,
    moltbookLastPostMs: Date.now(),
    lastPostedMoltbookReceiptFingerprint: fingerprint
  };
  await saveStateFn(next);
  return next;
}

async function recordMiscSuccess(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>, fingerprint: string): Promise<AgentState> {
  const next: AgentState = {
    ...(state as any),
    moltbookFailureCount: 0,
    moltbookCircuitBreakerDisabledUntilMs: null,
    moltbookLastPostMs: Date.now(),
    lastPostedMoltbookMiscFingerprint: fingerprint
  };
  await saveStateFn(next);
  return next;
}

export function createMoltbookPoster(cfg: AppConfig, state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): SocialPoster {
  let currentState = state;

  return {
    async post(text: string, kind?: SocialPostKind) {
      if (!kind || kind === "receipt") {
        const out = await postMoltbookReceipt(cfg, currentState, saveStateFn, text);
        currentState = out.state;
      } else {
        const out = await postMoltbookText(cfg, currentState, saveStateFn, { text, kind });
        currentState = out.state;
      }
    }
  };
}

export async function postMoltbookReceipt(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  text: string
): Promise<{ posted: boolean; state: AgentState; reason?: string }> {
  const client = createMoltbookClient(cfg);

  // DRY_RUN is a trading safety flag; social posting is still safe/useful in DRY_RUN.
  // The receipt text itself includes SIMULATED/LIVE mode.

  if (isDisabledByCircuitBreaker(state)) {
    logger.warn("moltbook posting disabled by circuit breaker", {
      disabledUntilMs: (state as any).moltbookCircuitBreakerDisabledUntilMs,
      failureCount: (state as any).moltbookFailureCount
    });
    return { posted: false, state, reason: "circuit_breaker" };
  }

  // Local anti-spam guardrail: reuse MIN_INTERVAL_MINUTES.
  const lastMs = (state as any).moltbookLastPostMs as number | null | undefined;
  if (typeof lastMs === "number" && cfg.MIN_INTERVAL_MINUTES > 0) {
    const since = Date.now() - lastMs;
    const min = minutesToMs(cfg.MIN_INTERVAL_MINUTES);
    if (since < min) {
      logger.info("moltbook.skip (min interval)", {
        sinceMinutes: Math.floor(since / 60_000),
        minIntervalMinutes: cfg.MIN_INTERVAL_MINUTES
      });
      return { posted: false, state, reason: "min_interval" };
    }
  }

  // Idempotency: do not post the same receipt twice.
  const fingerprint = sha256Hex(text);
  const lastFp = (state as any).lastPostedMoltbookReceiptFingerprint as string | null | undefined;
  if (lastFp && lastFp === fingerprint) {
    logger.info("moltbook.skip (duplicate receipt)", { fingerprint: fingerprint.slice(0, 16) + "..." });
    return { posted: false, state, reason: "duplicate" };
  }

  try {
    // Moltbook posts have a structured shape in skill.md (submolt/title/content). Receipts are plain text.
    // Put them in `content` with a lightweight title.
    await client.createPost({
      submolt: "general",
      title: "Based Intern receipt",
      content: text
    });

    const nextState = await recordReceiptSuccess(state, saveStateFn, fingerprint);
    logger.info("moltbook posted receipt", { fingerprint: fingerprint.slice(0, 16) + "..." });
    return { posted: true, state: nextState };
  } catch (err) {
    if (err instanceof MoltbookSuspendedError) {
      logger.warn("moltbook post skipped (account suspended)", { hint: err.hint });
      // Don't count suspension as a failure — just disable for 1 hour and retry later
      const nextState = await recordRateLimited(state, saveStateFn, minutesToMs(60));
      return { posted: false, state: nextState, reason: "suspended" };
    }

    if (err instanceof MoltbookRateLimitedError) {
      logger.warn("moltbook post skipped (rate limited)", { retryAfterMs: err.retryAfterMs });
      const nextState = await recordRateLimited(state, saveStateFn, err.retryAfterMs);
      return { posted: false, state: nextState, reason: "rate_limited" };
    }

    logger.warn("moltbook post failed", { error: err instanceof Error ? err.message : String(err) });
    const nextState = await recordFailure(state, saveStateFn);
    return { posted: false, state: nextState, reason: "error" };
  }
}

export async function postMoltbookText(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  args: { text: string; kind: SocialPostKind }
): Promise<{ posted: boolean; state: AgentState; reason?: string }> {
  const client = createMoltbookClient(cfg);
  const { text, kind } = args;

  // Apply viral formatting for opinion, news, and meta posts (NOT receipts)
  const shouldFormatViral = kind === "opinion" || kind === "news" || kind === "meta";
  const formattedText = shouldFormatViral ? formatViralPost(text, kind) : text;

  if (isDisabledByCircuitBreaker(state)) {
    logger.warn("moltbook posting disabled by circuit breaker", {
      disabledUntilMs: (state as any).moltbookCircuitBreakerDisabledUntilMs,
      failureCount: (state as any).moltbookFailureCount,
      kind
    });
    return { posted: false, state, reason: "circuit_breaker" };
  }

  // Local anti-spam guardrail: reuse MIN_INTERVAL_MINUTES.
  const lastMs = (state as any).moltbookLastPostMs as number | null | undefined;
  if (typeof lastMs === "number" && cfg.MIN_INTERVAL_MINUTES > 0) {
    const since = Date.now() - lastMs;
    const min = minutesToMs(cfg.MIN_INTERVAL_MINUTES);
    if (since < min) {
      logger.info("moltbook.skip (min interval)", {
        sinceMinutes: Math.floor(since / 60_000),
        minIntervalMinutes: cfg.MIN_INTERVAL_MINUTES,
        kind
      });
      return { posted: false, state, reason: "min_interval" };
    }
  }

  // Idempotency: use different fingerprint field for non-receipt posts.
  const fingerprint = sha256Hex(formattedText);
  const isReceipt = kind === 'receipt';
  const lastFpField = isReceipt ? 'lastPostedMoltbookReceiptFingerprint' : 'lastPostedMoltbookMiscFingerprint';
  const lastFp = (state as any)[lastFpField] as string | null | undefined;
  
  if (lastFp && lastFp === fingerprint) {
    logger.info("moltbook.skip (duplicate)", { 
      fingerprint: fingerprint.slice(0, 16) + "...",
      kind,
      field: lastFpField
    });
    return { posted: false, state, reason: "duplicate" };
  }

  try {
    // Title based on kind
    const title = kind === 'receipt' ? 'Based Intern receipt' : 'Based Intern update';
    
    await client.createPost({
      submolt: "general",
      title,
      content: formattedText
    });

    // Record success to the correct fingerprint field
    const nextState = isReceipt 
      ? await recordReceiptSuccess(state, saveStateFn, fingerprint)
      : await recordMiscSuccess(state, saveStateFn, fingerprint);
    
    logger.info("moltbook posted", { 
      fingerprint: fingerprint.slice(0, 16) + "...",
      kind,
      title,
      viralFormatted: shouldFormatViral
    });
    return { posted: true, state: nextState };
  } catch (err) {
    if (err instanceof MoltbookSuspendedError) {
      logger.warn("moltbook post skipped (account suspended)", { hint: err.hint, kind });
      const nextState = await recordRateLimited(state, saveStateFn, minutesToMs(60));
      return { posted: false, state: nextState, reason: "suspended" };
    }

    if (err instanceof MoltbookRateLimitedError) {
      logger.warn("moltbook post skipped (rate limited)", { 
        retryAfterMs: err.retryAfterMs,
        kind
      });
      const nextState = await recordRateLimited(state, saveStateFn, err.retryAfterMs);
      return { posted: false, state: nextState, reason: "rate_limited" };
    }

    logger.warn("moltbook post failed", { 
      error: err instanceof Error ? err.message : String(err),
      kind
    });
    const nextState = await recordFailure(state, saveStateFn);
    return { posted: false, state: nextState, reason: "error" };
  }
}

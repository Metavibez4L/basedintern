import crypto from "node:crypto";
import type { AppConfig } from "../../config.js";
import type { AgentState } from "../../agent/state.js";
import { logger } from "../../logger.js";
import type { SocialPoster } from "../poster.js";
import { createMoltbookClient } from "./client.js";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function minutesToMs(m: number): number {
  return Math.floor(m * 60_000);
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

async function recordSuccess(state: AgentState, saveStateFn: (s: AgentState) => Promise<void>, fingerprint: string): Promise<AgentState> {
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

export function createMoltbookPoster(cfg: AppConfig, state: AgentState, saveStateFn: (s: AgentState) => Promise<void>): SocialPoster {
  let currentState = state;

  return {
    async post(text: string) {
      const out = await postMoltbookReceipt(cfg, currentState, saveStateFn, text);
      currentState = out.state;
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

  if (cfg.DRY_RUN) {
    logger.info("moltbook.dry_run (would post)", { len: text.length });
    return { posted: false, state, reason: "dry_run" };
  }

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
    logger.info("moltbook.skip (duplicate)", { fingerprint: fingerprint.slice(0, 16) + "..." });
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

    const nextState = await recordSuccess(state, saveStateFn, fingerprint);
    logger.info("moltbook posted", { fingerprint: fingerprint.slice(0, 16) + "..." });
    return { posted: true, state: nextState };
  } catch (err) {
    logger.warn("moltbook post failed", { error: err instanceof Error ? err.message : String(err) });
    const nextState = await recordFailure(state, saveStateFn);
    return { posted: false, state: nextState, reason: "error" };
  }
}

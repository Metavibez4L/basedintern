import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../logger.js";

// Schema versioning for migrations
const STATE_SCHEMA_VERSION = 2;

/**
 * v1: Basic state (dayKey, tradesExecutedToday, lastExecutedTradeAtMs, etc.)
 * v2: Added lastSeenBlockNumber for more precise activity detection (2026-01-30)
 */

export type AgentState = {
  schemaVersion?: number; // For migrations
  lastExecutedTradeAtMs: number | null;
  // UTC day key, e.g. "2026-01-29"
  dayKey: string;
  tradesExecutedToday: number;
  // X API circuit breaker
  xApiFailureCount: number;
  xApiCircuitBreakerDisabledUntilMs: number | null;
  // Idempotency: fingerprint of last posted receipt
  lastPostedReceiptFingerprint: string | null;
  // Activity watcher state
  lastSeenNonce: number | null;
  lastSeenEthWei: string | null;
  lastSeenTokenRaw: string | null;
  lastSeenBlockNumber: number | null;
  // Optional heartbeat: last UTC day we posted (activity or heartbeat)
  lastPostDayUtc: string | null;
  // X Mentions poller (Phase 1)
  lastSeenMentionId?: string; // For pagination
  repliedMentionFingerprints?: string[]; // LRU list (max 20) of replied mention fingerprints for dedup
  lastSuccessfulMentionPollMs?: number; // When we last successfully polled mentions
};

export const DEFAULT_STATE: AgentState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  lastExecutedTradeAtMs: null,
  dayKey: utcDayKey(new Date()),
  tradesExecutedToday: 0,
  xApiFailureCount: 0,
  xApiCircuitBreakerDisabledUntilMs: null,
  lastPostedReceiptFingerprint: null,
  lastSeenNonce: null,
  lastSeenEthWei: null,
  lastSeenTokenRaw: null,
  lastSeenBlockNumber: null,
  lastPostDayUtc: null,
  lastSeenMentionId: undefined,
  repliedMentionFingerprints: undefined,
  lastSuccessfulMentionPollMs: undefined
};

export function statePath(): string {
  return path.join(process.cwd(), "data", "state.json");
}

/**
 * Migrate state from older versions to current schema.
 * Safe: always returns a valid AgentState, filling in missing fields with defaults.
 */
function migrateState(raw: any, version: number | undefined): AgentState {
  // v1 → v2: Add lastSeenBlockNumber if missing
  if (version === undefined || version < 2) {
    logger.info("state migration", { from: version || 1, to: STATE_SCHEMA_VERSION });
    if (!("lastSeenBlockNumber" in raw)) {
      raw.lastSeenBlockNumber = null;
    }
  }

  return raw as AgentState;
}

export async function loadState(): Promise<AgentState> {
  const p = statePath();
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as any;
    
    // Migrate to current version
    const migrated = migrateState(parsed, parsed.schemaVersion);

    const merged: AgentState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      lastExecutedTradeAtMs: migrated.lastExecutedTradeAtMs ?? null,
      dayKey: migrated.dayKey ?? utcDayKey(new Date()),
      tradesExecutedToday: migrated.tradesExecutedToday ?? 0,
      xApiFailureCount: migrated.xApiFailureCount ?? 0,
      xApiCircuitBreakerDisabledUntilMs: migrated.xApiCircuitBreakerDisabledUntilMs ?? null,
      lastPostedReceiptFingerprint: migrated.lastPostedReceiptFingerprint ?? null,
      lastSeenNonce: migrated.lastSeenNonce ?? null,
      lastSeenEthWei: migrated.lastSeenEthWei ?? null,
      lastSeenTokenRaw: migrated.lastSeenTokenRaw ?? null,
      lastSeenBlockNumber: migrated.lastSeenBlockNumber ?? null,
      lastPostDayUtc: migrated.lastPostDayUtc ?? null,
      lastSeenMentionId: migrated.lastSeenMentionId,
      repliedMentionFingerprints: migrated.repliedMentionFingerprints,
      lastSuccessfulMentionPollMs: migrated.lastSuccessfulMentionPollMs
    };

    // Reset daily counter if the day rolled over.
    const today = utcDayKey(new Date());
    if (merged.dayKey !== today) {
      merged.dayKey = today;
      merged.tradesExecutedToday = 0;
    }

    return merged;
  } catch (err) {
    // Create folder lazily and initialize with default state
    await ensureStateDir();
    const defaultState = { ...DEFAULT_STATE, schemaVersion: STATE_SCHEMA_VERSION };
    await saveState(defaultState);
    logger.info("initialized fresh state", { version: STATE_SCHEMA_VERSION });
    return { ...defaultState };
  }
}

export async function saveState(state: AgentState): Promise<void> {
  await ensureStateDir();
  const p = statePath();
  const toSave = {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION
  };
  await writeFile(p, JSON.stringify(toSave, null, 2), "utf8");
}

export async function recordExecutedTrade(state: AgentState, at: Date): Promise<AgentState> {
  const next: AgentState = { ...state };
  const today = utcDayKey(at);
  if (next.dayKey !== today) {
    next.dayKey = today;
    next.tradesExecutedToday = 0;
  }
  next.tradesExecutedToday += 1;
  next.lastExecutedTradeAtMs = at.getTime();
  await saveState(next);
  return next;
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function ensureStateDir(): Promise<void> {
  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
}


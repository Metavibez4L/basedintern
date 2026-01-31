import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../logger.js";

// Schema versioning for migrations
const STATE_SCHEMA_VERSION = 3;

/**
 * v1: Basic state (dayKey, tradesExecutedToday, lastExecutedTradeAtMs, etc.)
 * v2: Added lastSeenBlockNumber for more precise activity detection (2026-01-30)
 * v3: Added Base News Brain state (daily caps + dedupe) (2026-01-30)
 */

export type AgentState = {
  schemaVersion?: number; // For migrations
  lastExecutedTradeAtMs: number | null;
  // UTC day key, e.g. "2026-01-29"
  dayKey: string;
  tradesExecutedToday: number;

  // =========================
  // Base News Brain
  // =========================
  newsLastPostMs: number | null;
  newsDailyCount: number;
  newsLastPostDayUtc: string | null;
  seenNewsFingerprints: string[]; // LRU list (max 50)
  lastPostedNewsFingerprint: string | null; // X idempotency (separate from receipts)

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
  newsLastPostMs: null,
  newsDailyCount: 0,
  newsLastPostDayUtc: null,
  seenNewsFingerprints: [],
  lastPostedNewsFingerprint: null,
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

  // v2 → v3: Add Base News Brain fields
  if (version === undefined || version < 3) {
    logger.info("state migration", { from: version || 2, to: STATE_SCHEMA_VERSION });
    if (!("newsLastPostMs" in raw)) raw.newsLastPostMs = null;
    if (!("newsDailyCount" in raw)) raw.newsDailyCount = 0;
    if (!("newsLastPostDayUtc" in raw)) raw.newsLastPostDayUtc = null;
    if (!("seenNewsFingerprints" in raw) || !Array.isArray(raw.seenNewsFingerprints)) raw.seenNewsFingerprints = [];
    if (!("lastPostedNewsFingerprint" in raw)) raw.lastPostedNewsFingerprint = null;
  }

  return raw as AgentState;
}

// Test-only helper: allows validating migrations without touching the filesystem.
export function migrateStateForTests(raw: any): AgentState {
  const version = raw?.schemaVersion as number | undefined;
  const copy = raw && typeof raw === "object" ? { ...raw } : raw;
  return migrateState(copy, version);
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
      newsLastPostMs: migrated.newsLastPostMs ?? null,
      newsDailyCount: migrated.newsDailyCount ?? 0,
      newsLastPostDayUtc: migrated.newsLastPostDayUtc ?? null,
      seenNewsFingerprints: Array.isArray(migrated.seenNewsFingerprints) ? migrated.seenNewsFingerprints : [],
      lastPostedNewsFingerprint: migrated.lastPostedNewsFingerprint ?? null,
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

    // Reset news daily counter if day rolled over.
    const newsToday = today;
    if (merged.newsLastPostDayUtc !== newsToday) {
      merged.newsDailyCount = 0;
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

export function resetNewsDailyCountIfNeeded(state: AgentState, at: Date): AgentState {
  const today = utcDayKey(at);
  if (state.newsLastPostDayUtc === today) return state;
  return {
    ...state,
    newsDailyCount: 0
  };
}

export function addSeenNewsFingerprint(state: AgentState, fingerprint: string, max = 50): AgentState {
  const next = { ...state };
  const existing = next.seenNewsFingerprints ?? [];
  const filtered = existing.filter((f) => f !== fingerprint);
  filtered.push(fingerprint);
  while (filtered.length > max) filtered.shift();
  next.seenNewsFingerprints = filtered;
  return next;
}

export async function recordNewsPosted(state: AgentState, at: Date, fingerprintToRemember?: string): Promise<AgentState> {
  let next: AgentState = { ...state };
  next = resetNewsDailyCountIfNeeded(next, at);

  const today = utcDayKey(at);
  next.newsLastPostMs = at.getTime();
  next.newsLastPostDayUtc = today;
  next.newsDailyCount = (next.newsDailyCount ?? 0) + 1;
  if (fingerprintToRemember) {
    next = addSeenNewsFingerprint(next, fingerprintToRemember, 50);
  }
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


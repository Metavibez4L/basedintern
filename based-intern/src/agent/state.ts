import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../logger.js";

// Schema versioning for migrations
const STATE_SCHEMA_VERSION = 7;

/**
 * v1: Basic state (dayKey, tradesExecutedToday, lastExecutedTradeAtMs, etc.)
 * v2: Added lastSeenBlockNumber for more precise activity detection (2026-01-30)
 * v3: Added Base News Brain state (daily caps + dedupe) (2026-01-30)
 * v4: Added Moltbook posting state (anti-spam + dedupe + circuit breaker) (2026-02-01)
 * v5: Added news opinion generation state (2026-02-02)
 * v6: Added OpenClaw announcement state (one-time external agent announcement) (2026-02-03)
 * v7: Harden news opinion cycle (attempt gating + circuit breaker) (2026-02-05)
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

  // =========================
  // Moltbook (optional)
  // =========================
  moltbookLastPostMs?: number | null;
  lastPostedMoltbookReceiptFingerprint?: string | null;
  moltbookFailureCount?: number;
  moltbookCircuitBreakerDisabledUntilMs?: number | null;
  repliedMoltbookCommentIds?: string[]; // SHA256 fingerprints of replied comments
  moltbookLastReplyCheckMs?: number | null;

  // =========================
  // News Opinion (v5)
  // =========================
  newsOpinionLastFetchMs?: number | null;
  // Attempt gating: set when we *try* to run the cycle (prevents thrash on repeated failures)
  newsOpinionLastAttemptMs?: number | null;
  // Failure tracking / circuit breaker (prevents flakey loops from spamming OpenAI + posting)
  newsOpinionFailureCount?: number;
  newsOpinionCircuitBreakerDisabledUntilMs?: number | null;
  newsOpinionPostsToday?: number;
  newsOpinionLastDayUtc?: string | null; // YYYY-MM-DD
  postedNewsArticleIds?: string[]; // LRU list to prevent duplicates

  // =========================
  // OpenClaw Announcement (v6)
  // =========================
  openclawAnnouncementPosted?: boolean; // Flag to prevent duplicate posts
  openclawAnnouncementPostedAt?: number; // Timestamp (ms) when posted
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
  lastSuccessfulMentionPollMs: undefined,

  moltbookLastPostMs: null,
  lastPostedMoltbookReceiptFingerprint: null,
  moltbookFailureCount: 0,
  moltbookCircuitBreakerDisabledUntilMs: null,
  repliedMoltbookCommentIds: [],
  moltbookLastReplyCheckMs: null,

  newsOpinionLastFetchMs: null,
  newsOpinionLastAttemptMs: null,
  newsOpinionFailureCount: 0,
  newsOpinionCircuitBreakerDisabledUntilMs: null,
  newsOpinionPostsToday: 0,
  newsOpinionLastDayUtc: null,
  postedNewsArticleIds: []
};

export function statePath(): string {
  const fromEnv = process.env.STATE_PATH?.trim();
  const rel = fromEnv && fromEnv.length > 0 ? fromEnv : "data/state.json";
  return path.resolve(process.cwd(), rel);
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

  // v3 → v4: Add Moltbook fields
  if (version === undefined || version < 4) {
    logger.info("state migration", { from: version || 3, to: STATE_SCHEMA_VERSION });
    if (!("moltbookLastPostMs" in raw)) raw.moltbookLastPostMs = null;
    if (!("lastPostedMoltbookReceiptFingerprint" in raw)) raw.lastPostedMoltbookReceiptFingerprint = null;
    if (!("moltbookFailureCount" in raw)) raw.moltbookFailureCount = 0;
    if (!("moltbookCircuitBreakerDisabledUntilMs" in raw)) raw.moltbookCircuitBreakerDisabledUntilMs = null;
    if (!("repliedMoltbookCommentIds" in raw) || !Array.isArray(raw.repliedMoltbookCommentIds)) raw.repliedMoltbookCommentIds = [];
    if (!("moltbookLastReplyCheckMs" in raw)) raw.moltbookLastReplyCheckMs = null;
  }

  // v4 → v5: Add news opinion fields
  if (version === undefined || version < 5) {
    logger.info("state migration", { from: version || 4, to: STATE_SCHEMA_VERSION });
    if (!("newsOpinionLastFetchMs" in raw)) raw.newsOpinionLastFetchMs = null;
    if (!("newsOpinionPostsToday" in raw)) raw.newsOpinionPostsToday = 0;
    if (!("newsOpinionLastDayUtc" in raw)) raw.newsOpinionLastDayUtc = null;
    if (!("postedNewsArticleIds" in raw) || !Array.isArray(raw.postedNewsArticleIds)) raw.postedNewsArticleIds = [];
  }

  // v5 → v6: Add OpenClaw announcement fields
  if (version === undefined || version < 6) {
    logger.info("state migration", { from: version || 5, to: STATE_SCHEMA_VERSION });
    if (!("openclawAnnouncementPosted" in raw)) raw.openclawAnnouncementPosted = false;
    if (!("openclawAnnouncementPostedAt" in raw)) raw.openclawAnnouncementPostedAt = undefined;
  }

  // v6 → v7: Harden news opinion cycle (attempt gating + circuit breaker)
  if (version === undefined || version < 7) {
    logger.info("state migration", { from: version || 6, to: STATE_SCHEMA_VERSION });
    if (!("newsOpinionLastAttemptMs" in raw)) raw.newsOpinionLastAttemptMs = null;
    if (!("newsOpinionFailureCount" in raw)) raw.newsOpinionFailureCount = 0;
    if (!("newsOpinionCircuitBreakerDisabledUntilMs" in raw)) raw.newsOpinionCircuitBreakerDisabledUntilMs = null;
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
      lastSuccessfulMentionPollMs: migrated.lastSuccessfulMentionPollMs,

      moltbookLastPostMs: migrated.moltbookLastPostMs ?? null,
      lastPostedMoltbookReceiptFingerprint: migrated.lastPostedMoltbookReceiptFingerprint ?? null,
      moltbookFailureCount: migrated.moltbookFailureCount ?? 0,
      moltbookCircuitBreakerDisabledUntilMs: migrated.moltbookCircuitBreakerDisabledUntilMs ?? null,
      repliedMoltbookCommentIds: Array.isArray(migrated.repliedMoltbookCommentIds) ? migrated.repliedMoltbookCommentIds : [],
      moltbookLastReplyCheckMs: migrated.moltbookLastReplyCheckMs ?? null,

      newsOpinionLastFetchMs: migrated.newsOpinionLastFetchMs ?? null,
      newsOpinionLastAttemptMs: migrated.newsOpinionLastAttemptMs ?? null,
      newsOpinionFailureCount: migrated.newsOpinionFailureCount ?? 0,
      newsOpinionCircuitBreakerDisabledUntilMs: migrated.newsOpinionCircuitBreakerDisabledUntilMs ?? null,
      newsOpinionPostsToday: migrated.newsOpinionPostsToday ?? 0,
      newsOpinionLastDayUtc: migrated.newsOpinionLastDayUtc ?? null,
      postedNewsArticleIds: Array.isArray(migrated.postedNewsArticleIds) ? migrated.postedNewsArticleIds : [],

      openclawAnnouncementPosted: migrated.openclawAnnouncementPosted ?? false,
      openclawAnnouncementPostedAt: migrated.openclawAnnouncementPostedAt
    };

    // Reset daily counter if the day rolled over.
    const today = utcDayKey(new Date());
    if (merged.dayKey !== today) {
      merged.dayKey = today;
      merged.tradesExecutedToday = 0;
    }

    // Reset news daily counter if day rolled over.
    // Reset news opinion daily counter if day rolled over
    if (merged.newsOpinionLastDayUtc !== today) {
      merged.newsOpinionPostsToday = 0;
      merged.newsOpinionLastDayUtc = today;
    }

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
  const dir = path.dirname(statePath());
  await mkdir(dir, { recursive: true });
}


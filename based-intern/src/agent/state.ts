import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "../logger.js";

// Schema versioning for migrations
const STATE_SCHEMA_VERSION = 15;

/**
 * v1: Basic state (dayKey, tradesExecutedToday, lastExecutedTradeAtMs, etc.)
 * v2: Added lastSeenBlockNumber for more precise activity detection (2026-01-30)
 * v3: Added Base News Brain state (daily caps + dedupe) (2026-01-30)
 * v4: Added Moltbook posting state (anti-spam + dedupe + circuit breaker) (2026-02-01)
 * v5: Added news opinion generation state (2026-02-02)
 * v6: Added OpenClaw announcement state (one-time external agent announcement) (2026-02-03)
 * v7: Harden news opinion cycle (attempt gating + circuit breaker) (2026-02-05)
 * v8: Added lastPostedMoltbookMiscFingerprint for kind-aware social posting (2026-02-05)
 * v9: Harden X mentions replies (circuit breaker + throttling state) (2026-02-05)
 * v10: Moltbook viral engagement + proactive discussion posting (2026-02-05)
 * v11: Restart-proof news opinion dedupe (canonical URL fingerprints, LRU 200) (2026-02-05)
 * v12: Liquidity provision state fields (2026-02-05)
 * v13: X timeline since_id tracking — prevents re-fetching same tweets (2026-02-06)
 * v14: LP campaign social posting state (launch posted flag, daily counters, intervals) (2026-02-06)
 * v15: LP campaign template tracking + cross-system content dedupe fingerprints (2026-02-06)
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
  repliedMentionFingerprints?: string[]; // LRU list of replied mention fingerprints for dedup
  lastSuccessfulMentionPollMs?: number; // When we last successfully polled mentions
  xMentionsFailureCount?: number;
  xMentionsCircuitBreakerDisabledUntilMs?: number | null;
  xMentionsLastReplyMs?: number | null;

  // =========================
  // Moltbook (optional)
  // =========================
  moltbookLastPostMs?: number | null;
  lastPostedMoltbookReceiptFingerprint?: string | null;
  lastPostedMoltbookMiscFingerprint?: string | null; // For non-receipt posts (news, opinion, meta)
  moltbookFailureCount?: number;
  moltbookCircuitBreakerDisabledUntilMs?: number | null;
  // LRU list of replied Moltbook comment dedupe keys.
  // Current primary format is `id:<commentId>` (stable). Synthetic fallback is `fp:<sha256(...)>`.
  // Legacy entries may also include sha256(`${commentId}:${author}:${content}`) from older versions.
  repliedMoltbookCommentIds?: string[];
  moltbookLastReplyCheckMs?: number | null;

  // =========================
  // News Opinion (v5)
  // =========================
  newsOpinionLastFetchMs?: number | null;
  // Attempt gating: set when we *try* to run the cycle (prevents thrash on failures)
  newsOpinionLastAttemptMs?: number | null;
  // Failure tracking / circuit breaker (prevents flakey loops from spamming OpenAI + posting)
  newsOpinionFailureCount?: number;
  newsOpinionCircuitBreakerDisabledUntilMs?: number | null;
  newsOpinionPostsToday?: number;
  newsOpinionLastDayUtc?: string | null; // YYYY-MM-DD
  postedNewsArticleIds?: string[]; // LRU list to prevent duplicates
  // Restart-proof dedupe: canonical URL fingerprints (sha256 of canonicalized URL).
  // Survives state resets better than article IDs because same article from different
  // providers will match by URL. LRU 200 (larger than postedNewsArticleIds).
  postedNewsUrlFingerprints?: string[];

  // =========================
  // OpenClaw Announcement (v6)
  // =========================
  openclawAnnouncementPosted?: boolean; // Flag to prevent duplicate posts
  openclawAnnouncementPostedAt?: number; // Timestamp (ms) when posted

  // =========================
  // Moltbook Viral Engagement (v10)
  // =========================
  moltbookDiscussionLastPostMs?: number | null; // Last discussion/community post timestamp
  moltbookDiscussionPostsToday?: number; // Daily cap counter
  moltbookDiscussionLastDayUtc?: string | null; // For daily reset
  postedDiscussionTopics?: string[]; // LRU list of posted topics (max 50) for dedup

  // =========================
  // Liquidity Provision (v12)
  // =========================
  lpLastTickMs?: number | null; // Last LP management tick timestamp
  lpWethPoolTvlWei?: string | null; // Cached WETH pool TVL for social posting
  lpUsdcPoolTvlWei?: string | null; // Cached USDC pool TVL for social posting

  // =========================
  // X Timeline since_id tracking (v13)
  // =========================
  /** Per-username since_id map — only fetch tweets newer than the stored ID per account.
   *  Prevents re-fetching and re-evaluating the same tweets every cycle. */
  xTimelineSinceIds?: Record<string, string>;

  // =========================
  // LP Campaign (v14)
  // =========================
  lpCampaignLaunchPosted?: boolean; // One-time launch announcement posted
  lpCampaignLastPostMs?: number | null; // Last campaign post timestamp
  lpCampaignPostsToday?: number; // Daily counter
  lpCampaignLastDayUtc?: string | null; // For daily reset

  // =========================
  // LP Campaign Template Tracking + Content Dedupe (v15)
  // =========================
  /** Recently used LP campaign template indices by post type (prevents repetition) */
  lpCampaignRecentTemplates?: {
    status?: number[];
    guide?: number[];
    incentive?: number[];
    milestone?: number[];
    comparison?: number[];
  };
  /** Fingerprints of recently posted social content (all types) for similarity checking */
  recentSocialPostFingerprints?: string[]; // LRU list (max 20)
  /** Raw text of recent posts for similarity comparison */
  recentSocialPostTexts?: string[]; // LRU list (max 10) - actual content for comparison
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
  xMentionsFailureCount: 0,
  xMentionsCircuitBreakerDisabledUntilMs: null,
  xMentionsLastReplyMs: null,

  moltbookLastPostMs: null,
  lastPostedMoltbookReceiptFingerprint: null,
  lastPostedMoltbookMiscFingerprint: null,
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
  postedNewsArticleIds: [],
  postedNewsUrlFingerprints: [],

  openclawAnnouncementPosted: false,
  openclawAnnouncementPostedAt: undefined,

  moltbookDiscussionLastPostMs: null,
  moltbookDiscussionPostsToday: 0,
  moltbookDiscussionLastDayUtc: null,
  postedDiscussionTopics: [],

  xTimelineSinceIds: {},

  lpCampaignLaunchPosted: false,
  lpCampaignLastPostMs: null,
  lpCampaignPostsToday: 0,
  lpCampaignLastDayUtc: null,

  lpCampaignRecentTemplates: {
    status: [],
    guide: [],
    incentive: [],
    milestone: [],
    comparison: [],
  },
  recentSocialPostFingerprints: [],
  recentSocialPostTexts: [],
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

  // v7 → v8: Add lastPostedMoltbookMiscFingerprint for kind-aware social posting
  if (version === undefined || version < 8) {
    logger.info("state migration", { from: version || 7, to: STATE_SCHEMA_VERSION });
    if (!("lastPostedMoltbookMiscFingerprint" in raw)) raw.lastPostedMoltbookMiscFingerprint = null;
  }

  // v8 → v9: Harden X mentions replies (circuit breaker + throttling state)
  if (version === undefined || version < 9) {
    logger.info("state migration", { from: version || 8, to: STATE_SCHEMA_VERSION });
    if (!("xMentionsFailureCount" in raw)) raw.xMentionsFailureCount = 0;
    if (!("xMentionsCircuitBreakerDisabledUntilMs" in raw)) raw.xMentionsCircuitBreakerDisabledUntilMs = null;
    if (!("xMentionsLastReplyMs" in raw)) raw.xMentionsLastReplyMs = null;
  }

  // v9 → v10: Moltbook viral engagement + proactive discussion posting
  if (version === undefined || version < 10) {
    logger.info("state migration", { from: version || 9, to: STATE_SCHEMA_VERSION });
    if (!("moltbookDiscussionLastPostMs" in raw)) raw.moltbookDiscussionLastPostMs = null;
    if (!("moltbookDiscussionPostsToday" in raw)) raw.moltbookDiscussionPostsToday = 0;
    if (!("moltbookDiscussionLastDayUtc" in raw)) raw.moltbookDiscussionLastDayUtc = null;
    if (!("postedDiscussionTopics" in raw) || !Array.isArray(raw.postedDiscussionTopics)) raw.postedDiscussionTopics = [];
  }

  // v10 → v11: Restart-proof news opinion dedupe (canonical URL fingerprints)
  if (version === undefined || version < 11) {
    logger.info("state migration", { from: version || 10, to: STATE_SCHEMA_VERSION });
    if (!("postedNewsUrlFingerprints" in raw) || !Array.isArray(raw.postedNewsUrlFingerprints)) raw.postedNewsUrlFingerprints = [];
  }

  // v11 → v12: Liquidity provision state fields
  if (version === undefined || version < 12) {
    logger.info("state migration", { from: version || 11, to: STATE_SCHEMA_VERSION });
    if (!("lpLastTickMs" in raw)) raw.lpLastTickMs = null;
    if (!("lpWethPoolTvlWei" in raw)) raw.lpWethPoolTvlWei = null;
    if (!("lpUsdcPoolTvlWei" in raw)) raw.lpUsdcPoolTvlWei = null;
  }

  // v12 → v13: X timeline since_id tracking (prevents duplicate tweet fetching)
  if (version === undefined || version < 13) {
    logger.info("state migration", { from: version || 12, to: STATE_SCHEMA_VERSION });
    if (!("xTimelineSinceIds" in raw) || typeof raw.xTimelineSinceIds !== "object") {
      raw.xTimelineSinceIds = {};
    }
  }

  // v13 → v14: LP campaign social posting state
  if (version === undefined || version < 14) {
    logger.info("state migration", { from: version || 13, to: STATE_SCHEMA_VERSION });
    if (!("lpCampaignLaunchPosted" in raw)) raw.lpCampaignLaunchPosted = false;
    if (!("lpCampaignLastPostMs" in raw)) raw.lpCampaignLastPostMs = null;
    if (!("lpCampaignPostsToday" in raw)) raw.lpCampaignPostsToday = 0;
    if (!("lpCampaignLastDayUtc" in raw)) raw.lpCampaignLastDayUtc = null;
  }

  // v14 → v15: LP campaign template tracking + content dedupe
  if (version === undefined || version < 15) {
    logger.info("state migration", { from: version || 14, to: STATE_SCHEMA_VERSION });
    if (!("lpCampaignRecentTemplates" in raw) || typeof raw.lpCampaignRecentTemplates !== "object") {
      raw.lpCampaignRecentTemplates = {
        status: [],
        guide: [],
        incentive: [],
        milestone: [],
        comparison: [],
      };
    }
    if (!("recentSocialPostFingerprints" in raw) || !Array.isArray(raw.recentSocialPostFingerprints)) {
      raw.recentSocialPostFingerprints = [];
    }
    if (!("recentSocialPostTexts" in raw) || !Array.isArray(raw.recentSocialPostTexts)) {
      raw.recentSocialPostTexts = [];
    }
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
      xMentionsFailureCount: migrated.xMentionsFailureCount ?? 0,
      xMentionsCircuitBreakerDisabledUntilMs: migrated.xMentionsCircuitBreakerDisabledUntilMs ?? null,
      xMentionsLastReplyMs: migrated.xMentionsLastReplyMs ?? null,

      moltbookLastPostMs: migrated.moltbookLastPostMs ?? null,
      lastPostedMoltbookReceiptFingerprint: migrated.lastPostedMoltbookReceiptFingerprint ?? null,
      lastPostedMoltbookMiscFingerprint: migrated.lastPostedMoltbookMiscFingerprint ?? null,
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
      postedNewsUrlFingerprints: Array.isArray(migrated.postedNewsUrlFingerprints) ? migrated.postedNewsUrlFingerprints : [],

      openclawAnnouncementPosted: migrated.openclawAnnouncementPosted ?? false,
      openclawAnnouncementPostedAt: migrated.openclawAnnouncementPostedAt,

      moltbookDiscussionLastPostMs: migrated.moltbookDiscussionLastPostMs ?? null,
      moltbookDiscussionPostsToday: migrated.moltbookDiscussionPostsToday ?? 0,
      moltbookDiscussionLastDayUtc: migrated.moltbookDiscussionLastDayUtc ?? null,
      postedDiscussionTopics: Array.isArray(migrated.postedDiscussionTopics) ? migrated.postedDiscussionTopics : [],

      xTimelineSinceIds: (migrated.xTimelineSinceIds && typeof migrated.xTimelineSinceIds === "object")
        ? migrated.xTimelineSinceIds
        : {},

      lpCampaignLaunchPosted: migrated.lpCampaignLaunchPosted ?? false,
      lpCampaignLastPostMs: migrated.lpCampaignLastPostMs ?? null,
      lpCampaignPostsToday: migrated.lpCampaignPostsToday ?? 0,
      lpCampaignLastDayUtc: migrated.lpCampaignLastDayUtc ?? null,

      lpCampaignRecentTemplates: migrated.lpCampaignRecentTemplates ?? {
        status: [],
        guide: [],
        incentive: [],
        milestone: [],
        comparison: [],
      },
      recentSocialPostFingerprints: Array.isArray(migrated.recentSocialPostFingerprints) ? migrated.recentSocialPostFingerprints : [],
      recentSocialPostTexts: Array.isArray(migrated.recentSocialPostTexts) ? migrated.recentSocialPostTexts : [],
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

    // Reset discussion daily counter if day rolled over
    if (merged.moltbookDiscussionLastDayUtc !== today) {
      merged.moltbookDiscussionPostsToday = 0;
      merged.moltbookDiscussionLastDayUtc = today;
    }

    // Reset LP campaign daily counter if day rolled over
    if (merged.lpCampaignLastDayUtc !== today) {
      merged.lpCampaignPostsToday = 0;
      merged.lpCampaignLastDayUtc = today;
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

/**
 * Record a recently used LP campaign template index.
 */
export function recordLPTemplateUsed(
  state: AgentState,
  postType: "status" | "guide" | "incentive" | "milestone" | "comparison",
  templateIndex: number,
  maxHistory = 5
): AgentState {
  const next = { ...state };
  const current = next.lpCampaignRecentTemplates ?? {};
  
  const typeHistory = current[postType] ?? [];
  const updated = [...typeHistory, templateIndex].slice(-maxHistory);
  
  next.lpCampaignRecentTemplates = {
    ...current,
    [postType]: updated,
  };
  
  return next;
}

/**
 * Record a social post fingerprint for cross-system deduplication.
 */
export function recordSocialPostFingerprint(
  state: AgentState,
  fingerprint: string,
  postText: string,
  maxFingerprints = 20,
  maxTexts = 10
): AgentState {
  const next = { ...state };
  
  // Update fingerprints
  const existingFp = next.recentSocialPostFingerprints ?? [];
  const updatedFp = [...existingFp, fingerprint].slice(-maxFingerprints);
  next.recentSocialPostFingerprints = updatedFp;
  
  // Update texts for similarity checking
  const existingTexts = next.recentSocialPostTexts ?? [];
  const updatedTexts = [...existingTexts, postText].slice(-maxTexts);
  next.recentSocialPostTexts = updatedTexts;
  
  return next;
}

/**
 * Check if content is too similar to recent posts.
 */
export function isContentTooSimilar(
  state: AgentState,
  content: string,
  similarityThreshold = 0.75
): boolean {
  const recentTexts = state.recentSocialPostTexts ?? [];
  if (recentTexts.length === 0) return false;
  
  const normalizedNew = content.toLowerCase().replace(/\s+/g, " ").trim();
  const wordsNew = new Set(normalizedNew.split(/\s+/));
  
  for (const recent of recentTexts) {
    const normalizedRecent = recent.toLowerCase().replace(/\s+/g, " ").trim();
    const wordsRecent = new Set(normalizedRecent.split(/\s+/));
    
    const intersection = new Set([...wordsNew].filter(w => wordsRecent.has(w)));
    const union = new Set([...wordsNew, ...wordsRecent]);
    
    if (union.size === 0) continue;
    
    const similarity = intersection.size / union.size;
    if (similarity >= similarityThreshold) {
      return true;
    }
  }
  
  return false;
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

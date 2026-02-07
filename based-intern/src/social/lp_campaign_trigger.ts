/**
 * LP Campaign Trigger — Periodic social posts for liquidity provision.
 *
 * Fires LP campaign posts alongside regular agent activity.
 * Respects rate limits and idempotency to avoid spam.
 *
 * Config:
 *  - LP_CAMPAIGN_ENABLED (default: true when LP_ENABLED=true)
 *  - LP_CAMPAIGN_INTERVAL_MINUTES (default: 360 = 6 hours)
 *  - LP_CAMPAIGN_MAX_PER_DAY (default: 4)
 */

import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { recordLPTemplateUsed, recordSocialPostFingerprint, isContentTooSimilar } from "../agent/state.js";
import type { PoolStats } from "../chain/liquidity.js";
import type { SocialPoster, SocialPostKind } from "./poster.js";
import { generateLPCampaignPost, generatePoolLaunchPost } from "./lp_campaign.js";
import { fingerprintContent } from "./dedupe.js";
import { logger } from "../logger.js";

export type LPCampaignContext = {
  cfg: AppConfig;
  state: AgentState;
  saveStateFn: (s: AgentState) => Promise<void>;
  poster: SocialPoster;
  poolStats: {
    wethPool: PoolStats | null;
    usdcPool: PoolStats | null;
  } | null;
};

export type LPCampaignResult = {
  posted: boolean;
  state: AgentState;
  reason?: string;
  postText?: string;
};

const DEFAULT_INTERVAL_MINUTES = 360; // 6 hours
const DEFAULT_MAX_PER_DAY = 4;

/**
 * Check if LP campaign is enabled.
 */
export function isLPCampaignEnabled(cfg: AppConfig): boolean {
  // Default: enabled when LP_ENABLED is true
  const envEnabled = process.env.LP_CAMPAIGN_ENABLED;
  if (envEnabled === "true") return true;
  if (envEnabled === "false") return false;
  return cfg.LP_ENABLED === true; // Default to LP_ENABLED value (handle undefined)
}

/**
 * Get campaign interval in minutes.
 */
function getCampaignIntervalMinutes(): number {
  const env = process.env.LP_CAMPAIGN_INTERVAL_MINUTES;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed >= 60) return parsed;
  }
  return DEFAULT_INTERVAL_MINUTES;
}

/**
 * Get max posts per day.
 */
function getMaxPostsPerDay(): number {
  const env = process.env.LP_CAMPAIGN_MAX_PER_DAY;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed >= 1) return parsed;
  }
  return DEFAULT_MAX_PER_DAY;
}

/**
 * Reset daily counter if day has changed.
 */
function maybeResetDailyCounter(state: AgentState): AgentState {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if ((state.lpCampaignLastDayUtc ?? "") !== todayUtc) {
    return {
      ...state,
      lpCampaignPostsToday: 0,
      lpCampaignLastDayUtc: todayUtc,
    };
  }
  return state;
}

/**
 * Check if enough time has passed since last campaign post.
 */
function isIntervalDue(state: AgentState): boolean {
  const lastMs = state.lpCampaignLastPostMs ?? 0;
  const intervalMs = getCampaignIntervalMinutes() * 60 * 1000;
  return Date.now() - lastMs >= intervalMs;
}

/**
 * Check if we haven't exceeded daily cap.
 */
function canPostMoreToday(state: AgentState): boolean {
  const postsToday = state.lpCampaignPostsToday ?? 0;
  return postsToday < getMaxPostsPerDay();
}

/**
 * Post the pool launch announcement (one-time).
 * Call this on first tick when pool is live.
 */
export async function maybePostPoolLaunch(
  ctx: LPCampaignContext
): Promise<LPCampaignResult> {
  const { cfg, state, saveStateFn, poster } = ctx;

  // Already posted launch?
  if (state.lpCampaignLaunchPosted) {
    return { posted: false, state, reason: "already_posted" };
  }

  // Need social posting enabled
  if (cfg.SOCIAL_MODE === "none") {
    return { posted: false, state, reason: "social_disabled" };
  }

  const postText = generatePoolLaunchPost();
  const kind: SocialPostKind = "meta";

  // Check content similarity to avoid duplicating other recent posts
  if (isContentTooSimilar(state, postText, 0.7)) {
    logger.info("lp_campaign.launch_similarity_check", { 
      result: "content_too_similar_to_recent",
      action: "proceeding_anyway_for_launch"
    });
    // For launch post, we proceed anyway since it's one-time critical
  }

  try {
    await poster.post(postText, kind);

    // Record fingerprint for deduplication
    let nextState = recordSocialPostFingerprint(state, fingerprintContent(postText), postText);

    nextState = {
      ...nextState,
      lpCampaignLaunchPosted: true,
      lpCampaignLastPostMs: Date.now(),
      lpCampaignPostsToday: (nextState.lpCampaignPostsToday ?? 0) + 1,
      lpCampaignLastDayUtc: new Date().toISOString().slice(0, 10),
    };
    await saveStateFn(nextState);

    logger.info("lp_campaign.launch_posted", {
      poolAddress: "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc",
    });

    return { posted: true, state: nextState, postText };
  } catch (err) {
    logger.warn("lp_campaign.launch_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { posted: false, state, reason: "post_failed" };
  }
}

/**
 * Trigger an LP campaign post if conditions are met.
 * Call this periodically from the main agent loop.
 */
export async function maybeTriggerLPCampaign(
  ctx: LPCampaignContext
): Promise<LPCampaignResult> {
  const { cfg, state, saveStateFn, poster, poolStats } = ctx;

  // Check if campaign is enabled
  if (!isLPCampaignEnabled(cfg)) {
    return { posted: false, state, reason: "campaign_disabled" };
  }

  // Need social posting enabled
  if (cfg.SOCIAL_MODE === "none") {
    return { posted: false, state, reason: "social_disabled" };
  }

  // Reset daily counter if needed
  let workingState = maybeResetDailyCounter(state);

  // Check interval
  if (!isIntervalDue(workingState)) {
    return { posted: false, state: workingState, reason: "interval_not_due" };
  }

  // Check daily cap
  if (!canPostMoreToday(workingState)) {
    return { posted: false, state: workingState, reason: "daily_cap_reached" };
  }

  // Generate post content with template tracking
  const recentTemplates = workingState.lpCampaignRecentTemplates ?? {};
  const campaignResult = generateLPCampaignPost(
    poolStats?.wethPool ?? null,
    poolStats?.usdcPool ?? null,
    recentTemplates
  );

  const postText = campaignResult.post;
  const postType = campaignResult.postType;
  const templateIndex = campaignResult.templateIndex;

  // Check content similarity to avoid repetitive posts across all social systems
  if (isContentTooSimilar(workingState, postText, 0.75)) {
    logger.info("lp_campaign.skip_similar_content", {
      similarity: "content_too_similar_to_recent_posts",
      postType,
      templateIndex
    });
    return { posted: false, state: workingState, reason: "content_too_similar" };
  }

  const kind: SocialPostKind = "meta";

  try {
    await poster.post(postText, kind);

    // Update state with template tracking and content fingerprint
    let nextState = recordLPTemplateUsed(workingState, postType, templateIndex);
    nextState = recordSocialPostFingerprint(nextState, fingerprintContent(postText), postText);

    nextState = {
      ...nextState,
      lpCampaignLastPostMs: Date.now(),
      lpCampaignPostsToday: (nextState.lpCampaignPostsToday ?? 0) + 1,
    };
    await saveStateFn(nextState);

    logger.info("lp_campaign.posted", {
      postsToday: nextState.lpCampaignPostsToday,
      maxPerDay: getMaxPostsPerDay(),
      intervalMinutes: getCampaignIntervalMinutes(),
      postType,
      templateIndex,
    });

    return { posted: true, state: nextState, postText };
  } catch (err) {
    logger.warn("lp_campaign.post_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { posted: false, state: workingState, reason: "post_failed" };
  }
}

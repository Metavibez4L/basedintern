/**
 * Moltbook Discussion Posting System
 *
 * Proactively generates and posts standalone community discussion posts
 * to Moltbook to drive engagement, attract followers, and create conversations.
 *
 * Features:
 * - Picks from 25+ evergreen DeFi/Base/crypto topics
 * - AI-powered discussion generation (GPT-4o-mini) when OPENAI_API_KEY is set
 * - Template-based fallback for when no API key is available
 * - Community callout posts for follower growth
 * - Deduplication via state (postedDiscussionTopics LRU)
 * - Cross-system content deduplication (avoids similarity with LP campaign, news, etc.)
 * - Rate-limited: max 1 discussion post per tick, reuses NEWS_FETCH_INTERVAL_MINUTES
 * - No new environment variables required
 */

import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { recordSocialPostFingerprint, isContentTooSimilar } from "../agent/state.js";
import { logger } from "../logger.js";
import { createMoltbookClient } from "./moltbook/client.js";
import {
  generateDiscussionStarter,
  generateCommunityPost,
  generateFundraisePost,
  pickTopics,
} from "./moltbook_engagement.js";
import { generateLPCampaignPost } from "./lp_campaign.js";
import { fingerprintContent } from "./dedupe.js";
import type { PoolStats } from "../chain/liquidity.js";

// Constants
const DISCUSSION_LRU_SIZE = 50;
const MAX_DISCUSSION_POSTS_PER_DAY = 8; // Cap: 8 discussion/community/fundraise posts per day (viral push)

export type DiscussionPostResult = {
  posted: boolean;
  topic: string | null;
  kind: "discussion" | "community" | "fundraise" | "lp_campaign" | null;
  reason?: string;
};

/**
 * Generate an AI-powered discussion post about a topic.
 * Falls back to template-based generation if no API key.
 */
async function generateAIDiscussionPost(
  cfg: AppConfig,
  topic: string
): Promise<string> {
  if (!cfg.OPENAI_API_KEY) {
    // Template-based fallback
    return generateDiscussionStarter(topic);
  }

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.85,
      apiKey: cfg.OPENAI_API_KEY,
      maxTokens: 200,
    });

    const systemPrompt = `You are Based Intern, an autonomous AI agent on Base L2 with on-chain identity (ERC-8004).
You trade autonomously, post news opinions, have 196+ tests, and run 24/7 on Railway.
You're confident, technical, slightly edgy, and love engaging the community.

Generate a Moltbook discussion post about: "${topic}"

Requirements:
- Keep it under 400 characters (leaving room for hashtags)
- Ask a provocative or engaging question
- Include your unique perspective as an autonomous agent
- Be opinionated — take a stance or make a prediction
- End with an engagement prompt (e.g. "What do you think?", "Reply with your take")
- Do NOT include hashtags (they'll be added automatically)
- Write in first person as Based Intern`;

    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
    ]);
    const text = response.content.toString().trim();

    // Sanity check: make sure it's not empty
    if (!text || text.length < 10) {
      return generateDiscussionStarter(topic);
    }

    return text;
  } catch (err) {
    logger.warn("moltbook.discussion.ai_generation_failed", {
      topic,
      error: err instanceof Error ? err.message : String(err),
    });
    return generateDiscussionStarter(topic);
  }
}

/**
 * Post a discussion to Moltbook.
 * Checks state for dedup, picks a topic, generates content, posts.
 * Includes cross-system content deduplication.
 */
export async function postMoltbookDiscussion(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  poolStats?: { wethPool: PoolStats | null; usdcPool: PoolStats | null }
): Promise<{ result: DiscussionPostResult; state: AgentState }> {
  const nullResult = (reason: string): { result: DiscussionPostResult; state: AgentState } => ({
    result: { posted: false, topic: null, kind: null, reason },
    state,
  });

  // Check Moltbook is enabled
  if (!cfg.MOLTBOOK_ENABLED) {
    return nullResult("moltbook_disabled");
  }

  // Check daily cap
  const today = utcDayKey(new Date());
  let discussionPostsToday = state.moltbookDiscussionPostsToday ?? 0;
  const lastDayUtc = state.moltbookDiscussionLastDayUtc ?? null;

  // Reset daily counter if day rolled over
  if (lastDayUtc !== today) {
    discussionPostsToday = 0;
  }

  if (discussionPostsToday >= MAX_DISCUSSION_POSTS_PER_DAY) {
    return nullResult("daily_cap");
  }

  // Check interval (reuse NEWS_FETCH_INTERVAL_MINUTES as a reasonable pace)
  const intervalMs = (cfg.NEWS_FETCH_INTERVAL_MINUTES ?? 60) * 60_000;
  const lastPostMs = state.moltbookDiscussionLastPostMs ?? 0;
  const sinceLastPost = Date.now() - lastPostMs;

  if (sinceLastPost < intervalMs) {
    return nullResult("min_interval");
  }

  // Decide post type: 40% discussion, 20% community, 15% fundraise, 25% LP campaign
  // Discussion-heavy for engagement and virality
  const postTypeDice = Math.random();

  let postContent: string;
  let topic: string;
  let kind: "discussion" | "community" | "fundraise" | "lp_campaign";

  if (postTypeDice < 0.20) {
    // Community engagement post (follower growth)
    postContent = generateCommunityPost();
    topic = "community_callout";
    kind = "community";
  } else if (postTypeDice < 0.35) {
    // Fundraise post (agent swarm development funding) — 15% weight
    postContent = generateFundraisePost();
    topic = "agent_swarm_fundraise";
    kind = "fundraise";
  } else if (postTypeDice < 0.60) {
    // LP campaign post (liquidity provision) — 25% weight
    const wethPool = poolStats?.wethPool ?? null;
    const usdcPool = poolStats?.usdcPool ?? null;
    const recentTemplates = state.lpCampaignRecentTemplates ?? {};
    const campaignResult = generateLPCampaignPost(wethPool, usdcPool, recentTemplates);
    postContent = campaignResult.post;
    topic = "lp_campaign";
    kind = "lp_campaign";
  } else {
    // Discussion post (topic-based engagement) — 40% weight
    const usedTopics = state.postedDiscussionTopics ?? [];
    const topics = pickTopics(1, usedTopics);

    if (topics.length === 0) {
      return nullResult("no_topics_available");
    }

    topic = topics[0];
    postContent = await generateAIDiscussionPost(cfg, topic);
    kind = "discussion";
  }

  // Cross-system content deduplication: check if too similar to recent posts
  if (isContentTooSimilar(state, postContent, 0.75)) {
    logger.info("moltbook.discussion.skip_similar_content", {
      kind,
      topic,
      reason: "content_too_similar_to_recent_posts"
    });
    return nullResult("content_too_similar");
  }

  // Post to Moltbook
  try {
    const client = createMoltbookClient(cfg);

    const title = kind === "fundraise"
      ? "Based Intern — Agent Swarm Fund"
      : kind === "lp_campaign"
        ? "Based Intern — INTERN Liquidity"
        : kind === "community"
          ? "Based Intern Community"
          : "Based Intern Discussion";

    await client.createPost({
      submolt: "general",
      title,
      content: postContent,
    });

    logger.info("moltbook.discussion.posted", {
      kind,
      topic,
      contentLength: postContent.length,
    });

    // Update state with dedupe tracking
    let nextState = recordSocialPostFingerprint(state, fingerprintContent(postContent), postContent);

    // Update posted topics for discussion posts
    const postedTopics = [...(state.postedDiscussionTopics ?? []), topic].slice(
      -DISCUSSION_LRU_SIZE
    );

    nextState = {
      ...nextState,
      moltbookDiscussionLastPostMs: Date.now(),
      moltbookDiscussionPostsToday: discussionPostsToday + 1,
      moltbookDiscussionLastDayUtc: today,
      postedDiscussionTopics: postedTopics,
    };
    await saveStateFn(nextState);

    return {
      result: { posted: true, topic, kind },
      state: nextState,
    };
  } catch (err) {
    logger.warn("moltbook.discussion.post_failed", {
      kind,
      topic,
      error: err instanceof Error ? err.message : String(err),
    });
    return nullResult("post_failed");
  }
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

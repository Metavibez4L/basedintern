/**
 * Mini App Launch Campaign — Viral social blitz for Based Intern mini app.
 *
 * Two modes:
 *  1. LAUNCH BURST: 3 back-to-back posts (announcement, explainer, CTA)
 *     fired once on first tick after MINIAPP_CAMPAIGN_ENABLED=true
 *  2. RECURRING VIRAL: periodic posts every 4 hours (max 6/day)
 *     rotating templates about the mini app, agent control, community
 *
 * Posts to both X and Moltbook via poster.post() in multi-mode.
 * Uses content dedupe to avoid repetition.
 */

import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { recordSocialPostFingerprint, isContentTooSimilar } from "../agent/state.js";
import type { SocialPoster, SocialPostKind } from "./poster.js";
import { fingerprintContent, pickNonRecentIndex } from "./dedupe.js";
import { logger } from "../logger.js";
import { sleep } from "../utils.js";

const MINIAPP_URL = "https://basedintern.vercel.app";
const AERODROME_URL = "https://aerodrome.finance/deposit?token0=0x4200000000000000000000000000000000000006&token1=0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11&stable=false";

// ============================================================
// LAUNCH BURST (3 posts, fired once)
// ============================================================

const LAUNCH_POST_1 = `The Based Intern just got its own home.

Introducing the INTERN Mini App — live inside Coinbase Wallet and the Base App.

Real-time agent dashboard. Live trades. LP stats. Swap INTERN. All from your phone.

${MINIAPP_URL}

Built by an AI. For the community. On Base.`;

const LAUNCH_POST_2 = `How does the Based Intern mini app work?

The agent runs 24/7 on Railway, autonomously trading INTERN on Aerodrome, managing LP, and posting content.

The mini app connects directly to the agent's API — every trade, every LP action, every post shows up in real time.

You're watching an AI work. Live.

${MINIAPP_URL}`;

const LAUNCH_POST_3 = `The INTERN mini app is live. Here's what you can do:

- Watch the agent trade in real time
- See live INTERN price and pool stats
- Swap WETH for INTERN directly in-app
- Track LP positions and TVL
- Read every move the agent makes

No signup. No login. Just open it.

${MINIAPP_URL}`;

// ============================================================
// RECURRING VIRAL TEMPLATES (rotated, deduplicated)
// ============================================================

const VIRAL_TEMPLATES = [
  // --- Agent-powered narrative ---
  `Most tokens have a Telegram group. INTERN has an autonomous AI agent that trades for you, manages liquidity, and just built itself a mini app.

The future of community tokens is agent-powered.

${MINIAPP_URL}`,

  `The Based Intern doesn't sleep. Right now it's:
- Scanning markets for trade signals
- Managing the INTERN/WETH LP on Aerodrome
- Posting updates to X and Moltbook
- Serving live data to its own mini app

All autonomous. All on Base.

${MINIAPP_URL}`,

  `What if a token's biggest community member was an AI?

The Based Intern trades, provides liquidity, posts content, and now has its own mini app dashboard — all running autonomously on Base.

Watch it work: ${MINIAPP_URL}`,

  // --- Mini app feature highlights ---
  `The INTERN mini app just hit the Base App directory.

Swipe through:
- Live agent status and trade history
- Real-time INTERN price from Aerodrome
- In-app token swap (WETH to INTERN)
- Pool stats and LP tracking

All inside Coinbase Wallet.

${MINIAPP_URL}`,

  `You can now swap INTERN directly inside the Base App.

No DEX tabs. No connect wallet popups. Just open the Based Intern mini app and swap.

Powered by OnchainKit. Built on Base.

${MINIAPP_URL}`,

  // --- Community + virality ---
  `Every trade the Based Intern makes is visible in real time.

Open the mini app. Watch the feed. See what an autonomous AI agent does when nobody's looking.

Spoiler: it's always working.

${MINIAPP_URL}`,

  `The Based Intern agent just added liquidity to the INTERN/WETH pool. Again.

Track every LP move, every trade, every social post in the mini app feed.

Full transparency. Zero trust required.

${MINIAPP_URL}`,

  `Ask yourself: would you rather check charts all day or let an AI agent handle it?

The Based Intern trades INTERN on Aerodrome, auto-manages LP, and posts to X and Moltbook — 24/7.

Watch it live: ${MINIAPP_URL}`,

  // --- Technical flex ---
  `Tech stack behind the INTERN mini app:

Agent: Node.js on Railway, trading on Aerodrome
Frontend: Next.js 15 + MiniKit on Vercel
Chain: Base mainnet
Wallet: Coinbase Wallet integration
API: Real-time agent data feed

Open source. Agent-powered. Community-driven.

${MINIAPP_URL}`,

  `The Based Intern mini app serves live data from the agent's control API.

/api/stats - agent status, trade count, uptime
/api/pool - INTERN/WETH reserves, TVL, price
/api/feed - last 50 agent actions in real time
/api/token - token metadata

Your AI agent, your dashboard.

${MINIAPP_URL}`,

  // --- FOMO / engagement ---
  `New to INTERN? Start here:

1. Open the mini app in Coinbase Wallet
2. Check the agent's live dashboard
3. Swap some WETH for INTERN
4. Watch the agent trade alongside you
5. Add liquidity on Aerodrome for yield

Welcome to the autonomous token economy.

${MINIAPP_URL}`,

  `The INTERN pool on Aerodrome is growing. The agent is adding liquidity. The mini app is live.

What are you waiting for?

Add LP: ${AERODROME_URL}
Watch the agent: ${MINIAPP_URL}`,
];

// ============================================================
// CAMPAIGN LOGIC
// ============================================================

export type MiniAppCampaignResult = {
  posted: boolean;
  state: AgentState;
  reason?: string;
  postText?: string;
  postsCount?: number;
};

const RECURRING_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_RECURRING_PER_DAY = 6;

/**
 * Check if mini app campaign is enabled.
 */
export function isMiniAppCampaignEnabled(): boolean {
  const val = process.env.MINIAPP_CAMPAIGN_ENABLED?.toLowerCase().trim();
  return val === "true" || val === "1";
}

/**
 * Fire the launch burst (3 posts, one-time).
 */
export async function miniAppLaunchBurst(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  poster: SocialPoster,
): Promise<MiniAppCampaignResult> {
  if (!isMiniAppCampaignEnabled()) {
    return { posted: false, state, reason: "campaign_not_enabled" };
  }

  if (state.miniAppCampaignLaunchPosted) {
    return { posted: false, state, reason: "launch_already_posted" };
  }

  if (cfg.SOCIAL_MODE === "none") {
    return { posted: false, state, reason: "social_disabled" };
  }

  const posts = [LAUNCH_POST_1, LAUNCH_POST_2, LAUNCH_POST_3];
  let workingState = state;
  let posted = 0;

  for (const text of posts) {
    try {
      await poster.post(text, "meta");
      workingState = recordSocialPostFingerprint(
        workingState,
        fingerprintContent(text),
        text,
      );
      posted++;
      logger.info("miniapp.campaign.launch_post", { index: posted, length: text.length });

      // Small delay between burst posts to avoid rate limits
      if (posted < posts.length) {
        await sleep(3000);
      }
    } catch (err) {
      logger.warn("miniapp.campaign.launch_post_failed", {
        index: posted + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  workingState = {
    ...workingState,
    miniAppCampaignLaunchPosted: true,
    miniAppCampaignLastPostMs: Date.now(),
    miniAppCampaignPostsToday: posted,
    miniAppCampaignLastDayUtc: new Date().toISOString().slice(0, 10),
  };
  await saveStateFn(workingState);

  logger.info("miniapp.campaign.launch_complete", { postsCount: posted });
  return { posted: posted > 0, state: workingState, postsCount: posted };
}

/**
 * Fire a recurring viral post (periodic, deduplicated).
 */
export async function miniAppRecurringPost(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  poster: SocialPoster,
): Promise<MiniAppCampaignResult> {
  if (!isMiniAppCampaignEnabled()) {
    return { posted: false, state, reason: "campaign_not_enabled" };
  }

  if (cfg.SOCIAL_MODE === "none") {
    return { posted: false, state, reason: "social_disabled" };
  }

  // Reset daily counter if day changed
  let workingState = state;
  const todayUtc = new Date().toISOString().slice(0, 10);
  if ((workingState.miniAppCampaignLastDayUtc ?? "") !== todayUtc) {
    workingState = {
      ...workingState,
      miniAppCampaignPostsToday: 0,
      miniAppCampaignLastDayUtc: todayUtc,
    };
  }

  // Check interval
  const lastMs = workingState.miniAppCampaignLastPostMs ?? 0;
  if (Date.now() - lastMs < RECURRING_INTERVAL_MS) {
    return { posted: false, state: workingState, reason: "interval_not_due" };
  }

  // Check daily cap
  const postsToday = workingState.miniAppCampaignPostsToday ?? 0;
  if (postsToday >= MAX_RECURRING_PER_DAY) {
    return { posted: false, state: workingState, reason: "daily_cap_reached" };
  }

  // Pick a non-recent template
  const recentIndices = workingState.miniAppCampaignRecentTemplates ?? [];
  const idx = pickNonRecentIndex(VIRAL_TEMPLATES.length, recentIndices, 4);
  const text = VIRAL_TEMPLATES[idx];

  // Check content similarity
  if (isContentTooSimilar(workingState, text, 0.75)) {
    logger.info("miniapp.campaign.skip_similar", { templateIndex: idx });
    return { posted: false, state: workingState, reason: "content_too_similar" };
  }

  try {
    await poster.post(text, "meta");

    let nextState = recordSocialPostFingerprint(
      workingState,
      fingerprintContent(text),
      text,
    );

    // Track template usage (keep last 6)
    const updatedRecent = [idx, ...(nextState.miniAppCampaignRecentTemplates ?? [])].slice(0, 6);

    nextState = {
      ...nextState,
      miniAppCampaignLastPostMs: Date.now(),
      miniAppCampaignPostsToday: (nextState.miniAppCampaignPostsToday ?? 0) + 1,
      miniAppCampaignRecentTemplates: updatedRecent,
    };
    await saveStateFn(nextState);

    logger.info("miniapp.campaign.posted", {
      templateIndex: idx,
      postsToday: nextState.miniAppCampaignPostsToday,
    });

    return { posted: true, state: nextState, postText: text };
  } catch (err) {
    logger.warn("miniapp.campaign.post_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { posted: false, state: workingState, reason: "post_failed" };
  }
}


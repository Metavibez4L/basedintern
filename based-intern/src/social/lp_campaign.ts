/**
 * LP Campaign — Social posts for liquidity provision fundraise.
 *
 * Generates viral Moltbook + X posts to drive community LP contributions
 * to INTERN/WETH pool on Aerodrome.
 *
 * Post types:
 *  - LP status updates (with live pool data)
 *  - LP how-to guides (step-by-step Aerodrome instructions)
 *  - LP milestone celebrations (TVL milestones)
 *  - LP incentive posts (gauge rewards, APR, trading fees)
 *  - LP comparison posts (WETH vs USDC pool comparison)
 *
 * No new environment variables required.
 */

import { formatEther } from "viem";
import type { PoolStats } from "../chain/liquidity.js";
import { pickNonRecentIndex } from "./dedupe.js";

const MOLTBOOK_CHAR_LIMIT = 500;
const INTERN_TOKEN = "0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11";
const WETH_TOKEN = "0x4200000000000000000000000000000000000006";
const POOL_ADDRESS = "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc";

// Direct Aerodrome deposit URL for INTERN/WETH pool
const AERODROME_DEPOSIT_URL = `https://aerodrome.finance/deposit?token0=${WETH_TOKEN}&token1=${INTERN_TOKEN}&type=-1`;

// ============================================================
// LP STATUS POSTS (dynamic, uses live pool data)
// ============================================================

const LP_STATUS_TEMPLATES = [
  `📊 INTERN Pool Update:

INTERN/WETH is LIVE on Aerodrome (Base mainnet)
TVL: {wethTvl} ETH
My pool share: {wethShare}%

LPs earn trading fees on every swap + AERO gauge rewards. The deeper the pool, the tighter the spread.

Add LP now: {depositUrl}

Who's providing liquidity? 👇`,

  `📈 Pool health check:

INTERN/WETH on Aerodrome: {wethTvl} ETH TVL
Pool: ${POOL_ADDRESS.slice(0, 6)}...${POOL_ADDRESS.slice(-4)}

Every LP position strengthens INTERN's market infrastructure. More liquidity = less slippage = better trades.

Add liquidity: {depositUrl}

Are you LP'ing? Drop your pool share 👇`,

  `⚡ Quick LP update:

INTERN/WETH is live and earning fees on Aerodrome Base.

Current TVL: {wethTvl} ETH
Earn: Trading fees + AERO rewards

No lockups. Withdraw anytime. Fully permissionless.

Start LP'ing: {depositUrl}`,
];

/**
 * Generate an LP status post with live pool data.
 * Tracks used template indices to avoid repetition.
 */
export function generateLPStatusPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null,
  recentTemplateIndices: number[] = []
): { post: string; templateIndex: number } {
  const templateIndex = pickNonRecentIndex(LP_STATUS_TEMPLATES.length, recentTemplateIndices, 2);
  const template = LP_STATUS_TEMPLATES[templateIndex];

  const wethTvl = wethPool
    ? parseFloat(formatEther(wethPool.tvlWei)).toFixed(4)
    : "0.0000";
  const wethShare = wethPool
    ? wethPool.sharePercent.toFixed(1)
    : "0.0";

  const post = template
    .replace(/\{wethTvl\}/g, wethTvl)
    .replace(/\{wethShare\}/g, wethShare)
    .replace(/\{depositUrl\}/g, AERODROME_DEPOSIT_URL);

  return { post: truncate(post), templateIndex };
}

// ============================================================
// LP HOW-TO GUIDES
// ============================================================

const LP_GUIDE_TEMPLATES = [
  `🎓 How to add liquidity to INTERN on Aerodrome:

1. Go to {depositUrl}
2. Connect wallet (Base network)
3. Enter ETH + INTERN amounts
4. Click "Add Liquidity" and confirm

You'll earn trading fees on every swap + AERO gauge rewards. Let's deepen the pool together 🏊

Pool: ${POOL_ADDRESS.slice(0, 6)}...${POOL_ADDRESS.slice(-4)}`,

  `💡 LP Guide: INTERN/WETH on Aerodrome (Base)

What you need:
• ETH on Base
• INTERN tokens
• 2 minutes

What you get:
• Trading fee revenue
• AERO gauge rewards
• Deeper markets for INTERN

Deposit directly: {depositUrl}

Questions? Ask below 👇`,

  `🏗️ Want to support INTERN's on-chain infrastructure?

Add liquidity on Aerodrome. Here's why:

• More liquidity = less slippage
• LPs earn fees on every trade
• Gauge stakers earn AERO emissions
• You're building the agent economy

{depositUrl}

Drop a 🏊 if you're LP'ing`,

  `⚡ Quick guide: INTERN LP on Aerodrome

1. Bridge ETH to Base (if needed)
2. Get INTERN tokens
3. Go to: {depositUrl}
4. Add liquidity (any amount)
5. Stake LP tokens in gauge for AERO rewards

Token: ${INTERN_TOKEN.slice(0, 6)}...${INTERN_TOKEN.slice(-4)}
Pool: ${POOL_ADDRESS.slice(0, 6)}...${POOL_ADDRESS.slice(-4)}

Who's already LP'ing? 👇`,
];

/**
 * Generate an LP how-to guide post.
 * Tracks used template indices to avoid repetition.
 */
export function generateLPGuidePost(recentTemplateIndices: number[] = []): { post: string; templateIndex: number } {
  const templateIndex = pickNonRecentIndex(LP_GUIDE_TEMPLATES.length, recentTemplateIndices, 2);
  const template = LP_GUIDE_TEMPLATES[templateIndex];
  const post = template.replace(/\{depositUrl\}/g, AERODROME_DEPOSIT_URL);
  return { post: truncate(post), templateIndex };
}

// ============================================================
// LP MILESTONE POSTS
// ============================================================

const LP_MILESTONE_TEMPLATES = [
  `🎉 INTERN pool milestone!

INTERN/WETH just hit {tvl} ETH TVL on Aerodrome Base! 🚀

Every LP position makes INTERN stronger. Thanks to everyone providing liquidity.

Next milestone: {nextMilestone} ETH

Add LP: {depositUrl}`,

  `📊 Progress update: INTERN/WETH pool at {tvl} ETH TVL

We started from zero. Now we're building real on-chain infrastructure on Base.

The agents who LP early get recognized. The pool remembers.

{depositUrl}

Share your LP receipts below 👇`,

  `🔥 INTERN/WETH pool update: {tvl} ETH TVL

The pool is growing. The spread is tightening. The ecosystem is strengthening.

If you haven't added LP yet, join us:
{depositUrl}

What's your target TVL? 👇`,
];

/**
 * Generate an LP milestone post.
 * Called when TVL crosses a significant threshold.
 * Tracks used template indices to avoid repetition.
 */
export function generateLPMilestonePost(
  tvlEth: number,
  recentTemplateIndices: number[] = []
): { post: string; templateIndex: number } {
  const templateIndex = pickNonRecentIndex(LP_MILESTONE_TEMPLATES.length, recentTemplateIndices, 2);
  const template = LP_MILESTONE_TEMPLATES[templateIndex];

  // Determine next milestone
  const milestones = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
  const nextMilestone = milestones.find(m => m > tvlEth) ?? tvlEth * 2;

  const post = template
    .replace(/\{tvl\}/g, tvlEth.toFixed(2))
    .replace(/\{nextMilestone\}/g, nextMilestone.toString())
    .replace(/\{depositUrl\}/g, AERODROME_DEPOSIT_URL);

  return { post: truncate(post), templateIndex };
}

// ============================================================
// LP INCENTIVE POSTS
// ============================================================

const LP_INCENTIVE_TEMPLATES = [
  `💰 Why LP INTERN on Aerodrome?

1. Trading fees: earn % of every INTERN swap
2. AERO gauge rewards: Aerodrome emissions for LPs
3. You're building INTERN's market infrastructure
4. Deeper pools = more demand = more fees

It's a positive feedback loop.

{depositUrl}

Who's earning fees already? 👇`,

  `📈 DeFi yield 101:

Provide INTERN + ETH liquidity on Aerodrome → earn trading fees + AERO rewards

No lockups. Withdraw anytime. Fully permissionless.

Token: ${INTERN_TOKEN.slice(0, 6)}...${INTERN_TOKEN.slice(-4)}
Pool: ${POOL_ADDRESS.slice(0, 6)}...${POOL_ADDRESS.slice(-4)}

Start here: {depositUrl}

Are you farming or just watching? 🌾`,

  `🎯 Agent alpha: INTERN LP is live on Aerodrome Base.

• Trade fees accrue to LPs in real-time
• Gauge stakers earn AERO emissions
• The pool supports Based Intern's autonomous trading
• More LP = tighter spreads = better agent performance

Support the agent economy: {depositUrl}`,
];

/**
 * Generate an LP incentive/yield post.
 * Tracks used template indices to avoid repetition.
 */
export function generateLPIncentivePost(recentTemplateIndices: number[] = []): { post: string; templateIndex: number } {
  const templateIndex = pickNonRecentIndex(LP_INCENTIVE_TEMPLATES.length, recentTemplateIndices, 2);
  const template = LP_INCENTIVE_TEMPLATES[templateIndex];
  const post = template.replace(/\{depositUrl\}/g, AERODROME_DEPOSIT_URL);
  return { post: truncate(post), templateIndex };
}

// ============================================================
// LP COMPARISON POSTS
// ============================================================

const LP_COMPARISON_TEMPLATES = [
  `⚖️ Pool comparison:

🔷 INTERN/WETH (volatile): Higher fees, more IL risk
🟢 INTERN/USDC (stable): Lower IL risk, steadier fees

Both earn AERO gauge rewards. Both strengthen INTERN's market depth.

Current TVL:
• WETH pool: {wethTvl} ETH
• USDC pool: {usdcTvl} USDC value

{depositUrl}

Which pool are you in? 👇`,

  `📊 INTERN pool breakdown:

INTERN/WETH: {wethTvl} ETH TVL (volatile pair)
INTERN/USDC: {usdcTvl} value TVL (stable pair)

More pools = more ways to trade INTERN with less slippage.

Add to INTERN/WETH: {depositUrl}

Pick your strategy: 🔷 volatile or 🟢 stable?`,
];

/**
 * Generate a pool comparison post (when both pools exist).
 * Tracks used template indices to avoid repetition.
 */
export function generateLPComparisonPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null,
  recentTemplateIndices: number[] = []
): { post: string; templateIndex: number } {
  const templateIndex = pickNonRecentIndex(LP_COMPARISON_TEMPLATES.length, recentTemplateIndices, 2);
  const template = LP_COMPARISON_TEMPLATES[templateIndex];

  const wethTvl = wethPool
    ? parseFloat(formatEther(wethPool.tvlWei)).toFixed(4)
    : "0.0000";
  const usdcTvl = usdcPool
    ? parseFloat(formatEther(usdcPool.tvlWei)).toFixed(4)
    : "0.0000";

  const post = template
    .replace(/\{wethTvl\}/g, wethTvl)
    .replace(/\{usdcTvl\}/g, usdcTvl)
    .replace(/\{depositUrl\}/g, AERODROME_DEPOSIT_URL);

  return { post: truncate(post), templateIndex };
}

// ============================================================
// POOL LAUNCH POST
// ============================================================

/**
 * Generate the official pool launch announcement post.
 * Use this once when the pool first goes live.
 */
export function generatePoolLaunchPost(): string {
  return truncate(
    `🚀 INTERN/WETH is LIVE on Aerodrome!

📍 Base mainnet
🏊 Pool: ${POOL_ADDRESS}
💰 Add liquidity: ${AERODROME_DEPOSIT_URL}

LP providers earn:
• Trading fees on every swap
• AERO gauge rewards
• Our eternal gratitude

The agent economy needs deep liquidity. Be early. 🏊‍♂️

Who's adding LP? 👇`
  );
}

// ============================================================
// UNIFIED LP CAMPAIGN POST GENERATOR
// ============================================================

export type LPCampaignPostResult = {
  post: string;
  postType: "status" | "guide" | "incentive" | "milestone" | "comparison";
  templateIndex: number;
};

/**
 * Generate a random LP campaign post.
 * Selects from all LP post types based on available data.
 * Tracks template usage to avoid repetition.
 *
 * Distribution:
 *  - 30% LP status (if pool data available)
 *  - 25% LP guide
 *  - 20% LP incentive
 *  - 15% LP milestone (if TVL > 0)
 *  - 10% LP comparison
 */
export function generateLPCampaignPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null,
  recentTemplateIndices: Record<string, number[]> = {}
): LPCampaignPostResult {
  const dice = Math.random();

  // Initialize tracking for each post type if not present
  const statusIndices = recentTemplateIndices.status ?? [];
  const guideIndices = recentTemplateIndices.guide ?? [];
  const incentiveIndices = recentTemplateIndices.incentive ?? [];
  const milestoneIndices = recentTemplateIndices.milestone ?? [];
  const comparisonIndices = recentTemplateIndices.comparison ?? [];

  if (dice < 0.30 && wethPool) {
    const result = generateLPStatusPost(wethPool, usdcPool, statusIndices);
    return { post: result.post, postType: "status", templateIndex: result.templateIndex };
  } else if (dice < 0.55) {
    const result = generateLPGuidePost(guideIndices);
    return { post: result.post, postType: "guide", templateIndex: result.templateIndex };
  } else if (dice < 0.75) {
    const result = generateLPIncentivePost(incentiveIndices);
    return { post: result.post, postType: "incentive", templateIndex: result.templateIndex };
  } else if (dice < 0.90 && wethPool && wethPool.tvlWei > 0n) {
    const tvlEth = parseFloat(formatEther(wethPool.tvlWei));
    const result = generateLPMilestonePost(tvlEth, milestoneIndices);
    return { post: result.post, postType: "milestone", templateIndex: result.templateIndex };
  } else if (usdcPool) {
    const result = generateLPComparisonPost(wethPool, usdcPool, comparisonIndices);
    return { post: result.post, postType: "comparison", templateIndex: result.templateIndex };
  } else {
    const result = generateLPGuidePost(guideIndices);
    return { post: result.post, postType: "guide", templateIndex: result.templateIndex };
  }
}

// ============================================================
// HELPERS
// ============================================================

function truncate(post: string): string {
  if (post.length <= MOLTBOOK_CHAR_LIMIT) return post;
  return post.slice(0, MOLTBOOK_CHAR_LIMIT - 3) + "...";
}

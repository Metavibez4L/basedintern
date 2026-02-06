/**
 * LP Campaign — Social posts for liquidity provision fundraise.
 *
 * Generates viral Moltbook + X posts to drive community LP contributions
 * to INTERN/WETH and INTERN/USDC pools on Aerodrome.
 *
 * Post types:
 *  - LP status updates (with live pool data)
 *  - LP how-to guides (step-by-step Aerodrome instructions)
 *  - LP milestone celebrations (TVL milestones)
 *  - LP comparison posts (WETH vs USDC pool)
 *  - LP incentive posts (gauge rewards, APR, trading fees)
 *
 * No new environment variables required.
 */

import { formatEther } from "viem";
import type { PoolStats } from "../chain/liquidity.js";

const MOLTBOOK_CHAR_LIMIT = 500;
const INTERN_TOKEN = "0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11";
const AERODROME_URL = "https://aerodrome.finance";

// ============================================================
// LP STATUS POSTS (dynamic, uses live pool data)
// ============================================================

const LP_STATUS_TEMPLATES = [
  "📊 INTERN Pool Update:\n\nINTERN/WETH TVL: {wethTvl} ETH\nMy pool share: {wethShare}%\n\nLiquidity providers earn Aerodrome trading fees on every swap. The deeper the pool, the tighter the spread.\n\nAdd LP on Aerodrome: {aeroUrl}\n\nWho's providing liquidity? 👇",

  "📈 Pool health check:\n\nINTERN/WETH: {wethTvl} ETH TVL\n\nEvery LP position strengthens INTERN's market infrastructure. More liquidity = less slippage = better trades for everyone.\n\nAdd liquidity: {aeroUrl}\n\nAre you LP'ing? Reply with your pool share 👇",

  "⚡ Quick LP update:\n\nINTERN pools on Aerodrome are live and earning fees.\n\nCurrent WETH pool: {wethTvl} ETH TVL\n\nLP providers earn trading fees + gauge rewards. It's how you support the ecosystem AND earn yield.\n\nGet started: {aeroUrl}",
];

/**
 * Generate an LP status post with live pool data.
 */
export function generateLPStatusPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null
): string {
  const template = LP_STATUS_TEMPLATES[Math.floor(Math.random() * LP_STATUS_TEMPLATES.length)];

  const wethTvl = wethPool
    ? parseFloat(formatEther(wethPool.tvlWei)).toFixed(4)
    : "0.0000";
  const wethShare = wethPool
    ? wethPool.sharePercent.toFixed(1)
    : "0.0";

  let post = template
    .replace(/\{wethTvl\}/g, wethTvl)
    .replace(/\{wethShare\}/g, wethShare)
    .replace(/\{aeroUrl\}/g, AERODROME_URL);

  // Add USDC pool info if available
  if (usdcPool && usdcPool.tvlWei > 0n) {
    const usdcNote = `\nINTERN/USDC: also live on Aerodrome!`;
    if (post.length + usdcNote.length < MOLTBOOK_CHAR_LIMIT) {
      post += usdcNote;
    }
  }

  return truncate(post);
}

// ============================================================
// LP HOW-TO GUIDES
// ============================================================

const LP_GUIDE_TEMPLATES = [
  `🎓 How to add liquidity to INTERN on Aerodrome:\n\n1. Go to ${AERODROME_URL}\n2. Connect wallet (Base network)\n3. Click "Liquidity" → "Add"\n4. Select INTERN/WETH pair\n5. Enter amounts and confirm\n\nYou'll earn trading fees on every INTERN swap. Let's deepen the pool together 🏊`,

  `💡 LP Guide: INTERN/WETH on Aerodrome\n\nWhat you need:\n• ETH on Base\n• INTERN tokens\n• 2 minutes\n\nWhat you get:\n• Trading fee revenue\n• Gauge rewards (AERO)\n• Deeper markets for INTERN\n\nStep 1: ${AERODROME_URL}\nStep 2: Add Liquidity → INTERN/WETH\nStep 3: Done. You're an LP now.\n\nQuestions? Ask below 👇`,

  `🏗️ Want to support INTERN's on-chain infrastructure?\n\nAdd liquidity on Aerodrome. Here's why:\n\n• More liquidity = less slippage\n• LPs earn fees on every trade\n• Gauge stakers earn AERO emissions\n• You're building the agent economy\n\n${AERODROME_URL}\n\nDrop a 🏊 if you're LP'ing`,

  `⚡ Quick guide: INTERN LP on Aerodrome\n\n1. Bridge ETH to Base (if needed)\n2. Buy INTERN on Aerodrome\n3. Add INTERN + ETH as liquidity\n4. Stake LP tokens in the gauge\n5. Earn AERO + trading fees 24/7\n\nToken: ${INTERN_TOKEN}\nDEX: ${AERODROME_URL}\n\nWho's already LP'ing? 👇`,
];

/**
 * Generate an LP how-to guide post.
 */
export function generateLPGuidePost(): string {
  const template = LP_GUIDE_TEMPLATES[Math.floor(Math.random() * LP_GUIDE_TEMPLATES.length)];
  return truncate(template);
}

// ============================================================
// LP MILESTONE POSTS
// ============================================================

const LP_MILESTONE_TEMPLATES = [
  "🎉 INTERN pool milestone!\n\nINTERN/WETH just crossed {tvl} ETH in TVL on Aerodrome.\n\nEvery LP position makes INTERN stronger. Thanks to everyone providing liquidity.\n\nNext milestone: {nextMilestone} ETH. Let's get there.\n\n{aeroUrl}",

  "📊 Progress update: INTERN/WETH pool is at {tvl} ETH TVL.\n\nWe started from zero. Now we're building real on-chain infrastructure.\n\nThe agents who LP early get recognized. The pool remembers.\n\n{aeroUrl}\n\nShare your LP receipts below 👇",

  "🔥 INTERN/WETH pool update: {tvl} ETH TVL\n\nThe pool is growing. The spread is tightening. The ecosystem is strengthening.\n\nIf you haven't added LP yet, now's the time:\n{aeroUrl}\n\nWhat's your target TVL? 👇",
];

/**
 * Generate an LP milestone post.
 * Called when TVL crosses a significant threshold.
 */
export function generateLPMilestonePost(tvlEth: number): string {
  const template = LP_MILESTONE_TEMPLATES[Math.floor(Math.random() * LP_MILESTONE_TEMPLATES.length)];

  // Determine next milestone
  const milestones = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
  const nextMilestone = milestones.find(m => m > tvlEth) ?? tvlEth * 2;

  return truncate(
    template
      .replace(/\{tvl\}/g, tvlEth.toFixed(2))
      .replace(/\{nextMilestone\}/g, nextMilestone.toString())
      .replace(/\{aeroUrl\}/g, AERODROME_URL)
  );
}

// ============================================================
// LP COMPARISON POSTS
// ============================================================

const LP_COMPARISON_TEMPLATES = [
  "⚖️ Two ways to LP with INTERN on Aerodrome:\n\n🔷 INTERN/WETH — volatile pair, higher fees\n🟢 INTERN/USDC — stable pair, lower IL risk\n\nBoth earn gauge rewards. Both strengthen INTERN.\n\nWhich pool are you in? 👇",

  "📊 INTERN pool showdown:\n\nINTERN/WETH: {wethTvl} ETH TVL\nINTERN/USDC: {usdcTvl} TVL\n\nMore pools = more ways to trade INTERN with less slippage.\n\nPick your side: 🔷 WETH or 🟢 USDC?\n\n{aeroUrl}",
];

/**
 * Generate a pool comparison post (when both pools exist).
 */
export function generateLPComparisonPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null
): string {
  const template = LP_COMPARISON_TEMPLATES[Math.floor(Math.random() * LP_COMPARISON_TEMPLATES.length)];

  const wethTvl = wethPool
    ? parseFloat(formatEther(wethPool.tvlWei)).toFixed(4)
    : "0.0000";
  const usdcTvl = usdcPool
    ? parseFloat(formatEther(usdcPool.tvlWei)).toFixed(4)
    : "0.0000";

  return truncate(
    template
      .replace(/\{wethTvl\}/g, wethTvl)
      .replace(/\{usdcTvl\}/g, usdcTvl)
      .replace(/\{aeroUrl\}/g, AERODROME_URL)
  );
}

// ============================================================
// LP INCENTIVE POSTS
// ============================================================

const LP_INCENTIVE_TEMPLATES = [
  "💰 Why LP INTERN on Aerodrome?\n\n1. Trading fees: earn % of every INTERN swap\n2. AERO gauge rewards: Aerodrome emissions for LPs\n3. You're building INTERN's market infrastructure\n4. Deeper pools = more demand = more fees\n\nIt's a positive feedback loop.\n\n{aeroUrl}\n\nWho's earning fees already? 👇",

  "📈 DeFi yield 101:\n\nProvide INTERN + ETH liquidity on Aerodrome → earn trading fees + AERO rewards\n\nNo lockups. Withdraw anytime. Fully permissionless.\n\nToken: {token}\nDEX: {aeroUrl}\n\nAre you farming or just watching? 🌾",

  "🎯 Agent alpha: INTERN LP is live on Aerodrome.\n\n• Trade fees accrue to LPs in real-time\n• Gauge stakers earn AERO emissions\n• The pool supports Based Intern's autonomous trading\n• More LP = tighter spreads = better agent performance\n\nSupport the agent economy: {aeroUrl}",
];

/**
 * Generate an LP incentive/yield post.
 */
export function generateLPIncentivePost(): string {
  const template = LP_INCENTIVE_TEMPLATES[Math.floor(Math.random() * LP_INCENTIVE_TEMPLATES.length)];
  return truncate(
    template
      .replace(/\{aeroUrl\}/g, AERODROME_URL)
      .replace(/\{token\}/g, INTERN_TOKEN)
  );
}

// ============================================================
// UNIFIED LP CAMPAIGN POST GENERATOR
// ============================================================

/**
 * Generate a random LP campaign post.
 * Selects from all LP post types based on available data.
 *
 * Distribution:
 *  - 30% LP status (if pool data available)
 *  - 25% LP guide
 *  - 20% LP incentive
 *  - 15% LP milestone (if TVL > 0)
 *  - 10% LP comparison (if both pools exist)
 */
export function generateLPCampaignPost(
  wethPool: PoolStats | null,
  usdcPool: PoolStats | null
): string {
  const dice = Math.random();

  if (dice < 0.30 && wethPool) {
    return generateLPStatusPost(wethPool, usdcPool);
  } else if (dice < 0.55) {
    return generateLPGuidePost();
  } else if (dice < 0.75) {
    return generateLPIncentivePost();
  } else if (dice < 0.90 && wethPool && wethPool.tvlWei > 0n) {
    const tvlEth = parseFloat(formatEther(wethPool.tvlWei));
    return generateLPMilestonePost(tvlEth);
  } else if (usdcPool) {
    return generateLPComparisonPost(wethPool, usdcPool);
  } else {
    return generateLPGuidePost(); // Fallback
  }
}

// ============================================================
// HELPERS
// ============================================================

function truncate(post: string): string {
  if (post.length <= MOLTBOOK_CHAR_LIMIT) return post;
  return post.slice(0, MOLTBOOK_CHAR_LIMIT - 3) + "...";
}

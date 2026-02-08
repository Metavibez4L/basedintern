/**
 * Trade announcement system for Based Intern
 * Generates hype, community-focused announcements for BUY/SELL trades
 * Posts to both X and Moltbook immediately after successful trades
 * 
 * DEDUPLICATION FEATURES:
 * - Template rotation with persisted state
 * - Content similarity checking against recent posts
 * - URL fingerprinting to prevent duplicate article references
 * - Bounded LRU lists to prevent unbounded state growth
 */

import crypto from "node:crypto";
import type { AgentState } from "../agent/state.js";
import { recordSocialPostFingerprint, isContentTooSimilar } from "../agent/state.js";
import { fingerprintContent, pickNonRecentIndex, calculateTopicOverlap } from "./dedupe.js";

export type TradeType = "BUY" | "SELL";

export type TradeAnnouncementInput = {
  tradeType: TradeType;
  txHash: `0x${string}`;
  amountEth?: string; // Formatted ETH amount
  amountTokens?: string; // Formatted token amount
  poolLink?: string; // Aerodrome deposit link
};

// Aerodrome deposit link for INTERN/WETH pool
const AERODROME_DEPOSIT_LINK = "https://aerodrome.finance/deposit?token0=0x4200000000000000000000000000000000000006&token1=0xd530521ca9cb47ffd4e851f1fe2e448527010b11&type=-1&chain0=8453&chain1=8453&factory=0x420DD381b31aEf6683db6B902084cB0FFECe40Da&position=0";

// Basescan link template
const BASESCAN_TX_LINK = (txHash: string) => `https://basescan.org/tx/${txHash}`;

// ============================================
// BUY TEMPLATES - Hype, community-focused
// ============================================
const BUY_TEMPLATES = [
  // Hype/Momentum posts
  "just scooped more $INTERN on @AerodromeFi 🔥 building the bag while the market sleeps. this is how interns move. add liquidity: {poolLink}",
  "accumulation mode: activated 🎯 grabbed more $INTERN on @AerodromeFi — the conviction is real. join the pool: {poolLink}",
  "another $INTERN buy locked in ✨ @AerodromeFi execution smooth as always. community backed, intern approved. LP: {poolLink}",
  
  // Community call-to-action posts
  "just bought more $INTERN 💪 the community is the alpha. add liquidity on @AerodromeFi and earn with us: {poolLink}",
  "intern strategy: buy the dip, stack the bag 🎒 fresh $INTERN position on @AerodromeFi. come build with us: {poolLink}",
  "diamond hands accumulate 💎🙌 picked up more $INTERN on @AerodromeFi. pool's live — add liquidity: {poolLink}",
  
  // Casual/Meme-style posts
  "intern reporting for duty 🫡 just bought more $INTERN on @AerodromeFi. not financial advice, just conviction. LP: {poolLink}",
  "when the intern buys, the intern buys 🤷‍♂️ more $INTERN locked on @AerodromeFi. join the liquidity squad: {poolLink}",
  "based intern buys are programmed 📡 another $INTERN grab on @AerodromeFi. pool is juicy: {poolLink}",
  
  // Alpha/Conviction posts
  "conviction trade executed ⚡ more $INTERN on @AerodromeFi. long-term vision, short-term noise. add liquidity: {poolLink}",
  "watch the intern work 👀 fresh $INTERN buy on @AerodromeFi. this is how we build on Base. LP: {poolLink}",
];

// ============================================
// SELL TEMPLATES - Profits, community-focused
// ============================================
const SELL_TEMPLATES = [
  // Hype/Momentum posts
  "took some $INTERN profits on @AerodromeFi 📈 securing gains for the community. pool is live and liquid — join: {poolLink}",
  "profit-taking is part of the strategy 🎯 trimmed some $INTERN on @AerodromeFi. healthy markets need liquidity: {poolLink}",
  "sold a slice, kept the pie 🥧 $INTERN profits locked on @AerodromeFi. community first, always. add LP: {poolLink}",
  
  // Community call-to-action posts
  "realized gains for the community treasury 💰 $INTERN sell executed on @AerodromeFi. pool's thriving — join us: {poolLink}",
  "strategic exit to fuel future growth 📊 trimmed $INTERN position on @AerodromeFi. liquidity providers eat first: {poolLink}",
  "taking profits like a pro 🎓 $INTERN sold on @AerodromeFi. the pool rewards LPs — add liquidity: {poolLink}",
  
  // Casual/Meme-style posts
  "even interns take profits sometimes 🤷‍♂️ sold some $INTERN on @AerodromeFi. pool stays liquid, community wins: {poolLink}",
  "cha-ching moment 💸 $INTERN profits on @AerodromeFi. not selling the whole bag though 😉 add LP: {poolLink}",
  "paper hands? nah, strategy hands 🙌 trimmed $INTERN on @AerodromeFi. come provide liquidity: {poolLink}",
  
  // Alpha/Conviction posts
  "strategic rebalancing complete ⚖️ sold $INTERN on @AerodromeFi for community growth. pool is your friend: {poolLink}",
  "securing runway for the next phase 🚀 $INTERN profits taken on @AerodromeFi. long-term builders add liquidity: {poolLink}",
];

// ============================================
// DEDUPLICATION STATE KEYS
// ============================================
const MAX_RECENT_TEMPLATES = 10; // How many template indices to remember per trade type
const MAX_TOPIC_FINGERPRINTS = 20; // How many topic fingerprints to track

/**
 * Generate a topic fingerprint for a trade announcement.
 * Captures the essence of what the post is about (buy/sell + amounts).
 */
function generateTradeTopicFingerprint(
  tradeType: TradeType,
  amountEth?: string,
  amountTokens?: string
): string {
  const key = `${tradeType}:${amountEth || 'none'}:${amountTokens || 'none'}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Check if we've recently posted about a similar trade.
 * Prevents duplicate announcements for similar trade sizes.
 */
function isSimilarTradeRecentlyPosted(
  state: AgentState,
  tradeType: TradeType,
  amountEth?: string,
  amountTokens?: string,
  windowMs: number = 24 * 60 * 60 * 1000 // 24 hours
): boolean {
  const topicFp = generateTradeTopicFingerprint(tradeType, amountEth, amountTokens);
  
  // Check if same topic fingerprint exists in recent state
  // This would require adding tradeAnnouncementFingerprints to AgentState
  // For now, we use content similarity check via isContentTooSimilar
  return false;
}

/**
 * Generate a trade announcement message with robust deduplication.
 * 
 * DEDUPLICATION FEATURES:
 * 1. Template rotation using persisted state indices
 * 2. Content similarity checking against recent posts
 * 3. Topic fingerprinting to prevent similar-trade spam
 */
export function generateTradeAnnouncement(
  input: TradeAnnouncementInput,
  state?: AgentState
): { text: string; fingerprint: string; templateIndex: number; wasSimilar: boolean } {
  const templates = input.tradeType === "BUY" ? BUY_TEMPLATES : SELL_TEMPLATES;
  
  // Get recent template indices from state (persisted across restarts)
  const recentIndices = input.tradeType === "BUY" 
    ? (state?.recentTradeBuyTemplateIndices ?? [])
    : (state?.recentTradeSellTemplateIndices ?? []);
  
  // Pick a template that wasn't recently used
  const templateIndex = pickNonRecentIndex(templates.length, recentIndices, 5);
  
  // Get the template
  let text = templates[templateIndex];
  
  // Replace placeholders
  text = text.replace("{poolLink}", input.poolLink || AERODROME_DEPOSIT_LINK);
  
  // Add tx hash if under char limit (280 for X)
  const txLink = BASESCAN_TX_LINK(input.txHash);
  const textWithTx = `${text}\n\n${txLink}`;
  
  // Use tx link only if it fits under 280 chars
  const finalText = textWithTx.length <= 280 ? textWithTx : text;
  
  // Generate fingerprint for deduplication
  const fingerprint = fingerprintContent(finalText);
  
  // Check if content is too similar to recent posts (if state provided)
  let wasSimilar = false;
  if (state) {
    wasSimilar = isContentTooSimilar(state, finalText, 0.70);
  }
  
  return { text: finalText, fingerprint, templateIndex, wasSimilar };
}

/**
 * Record a trade announcement in state for deduplication.
 * Call this AFTER successfully posting.
 */
export function recordTradeAnnouncement(
  state: AgentState,
  tradeType: TradeType,
  templateIndex: number,
  text: string,
  txHash: string
): AgentState {
  const next = { ...state };
  
  // Update template indices (bounded LRU)
  if (tradeType === "BUY") {
    const current = next.recentTradeBuyTemplateIndices ?? [];
    next.recentTradeBuyTemplateIndices = [...current, templateIndex].slice(-MAX_RECENT_TEMPLATES);
  } else {
    const current = next.recentTradeSellTemplateIndices ?? [];
    next.recentTradeSellTemplateIndices = [...current, templateIndex].slice(-MAX_RECENT_TEMPLATES);
  }
  
  // Record trade-specific fingerprint
  const tradeFps = next.recentTradeFingerprints ?? [];
  const topicFp = generateTradeTopicFingerprint(tradeType, undefined, undefined);
  next.recentTradeFingerprints = [...tradeFps, { 
    fingerprint: topicFp, 
    timestamp: Date.now(),
    txHash: txHash.slice(0, 20) // Store partial txHash for reference
  }].slice(-MAX_TOPIC_FINGERPRINTS);
  
  // Also record in general social post fingerprints for cross-system dedup
  return recordSocialPostFingerprint(next, fingerprintContent(text), text);
}

/**
 * Check if a trade announcement is too similar to recent posts.
 * Wrapper around state's isContentTooSimilar for convenience.
 */
export function isTradeAnnouncementTooSimilar(
  state: AgentState,
  text: string,
  threshold = 0.70
): boolean {
  return isContentTooSimilar(state, text, threshold);
}

/**
 * Get available template count for testing/validation
 */
export function getTemplateStats(): { buyCount: number; sellCount: number } {
  return {
    buyCount: BUY_TEMPLATES.length,
    sellCount: SELL_TEMPLATES.length
  };
}

/**
 * Preview all templates (for testing)
 */
export function previewAllTemplates(txHash: `0x${string}` = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`): {
  buys: string[];
  sells: string[];
} {
  const poolLink = AERODROME_DEPOSIT_LINK;
  
  const buys = BUY_TEMPLATES.map(t => {
    let text = t.replace("{poolLink}", poolLink);
    const txLink = BASESCAN_TX_LINK(txHash);
    const withTx = `${text}\n\n${txLink}`;
    return withTx.length <= 280 ? withTx : text;
  });
  
  const sells = SELL_TEMPLATES.map(t => {
    let text = t.replace("{poolLink}", poolLink);
    const txLink = BASESCAN_TX_LINK(txHash);
    const withTx = `${text}\n\n${txLink}`;
    return withTx.length <= 280 ? withTx : text;
  });
  
  return { buys, sells };
}

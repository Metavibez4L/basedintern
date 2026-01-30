import { parseEther, erc20Abi } from "viem";
import type { Address, PublicClient } from "viem";
import { logger } from "../logger.js";

/**
 * Activity detection context passed to watcher
 */
export type ActivityWatchContext = {
  chain: string;
  publicClient: PublicClient;
  walletAddress: Address;
  tokenAddress: Address | null;
  decimals: number;
  minEthDeltaWei: bigint;
  minTokenDeltaRaw: bigint;
};

/**
 * Result of activity detection
 */
export type ActivityDetectionResult = {
  changed: boolean;
  reasons: string[];
  deltas: {
    nonceChanged: boolean;
    ethChanged: boolean;
    ethDelta?: string;
    tokenChanged: boolean;
    tokenDelta?: string;
  };
  newStatePatch: {
    lastSeenNonce: number | null;
    lastSeenEthWei: string | null;
    lastSeenTokenRaw: string | null;
    lastSeenBlockNumber: number | null;
  };
};

/**
 * Detect meaningful onchain activity since last tick
 * Returns whether anything changed, reasons, and new state to persist
 */
export async function watchForActivity(
  ctx: ActivityWatchContext,
  lastSeenNonce: number | null,
  lastSeenEthWei: string | null,
  lastSeenTokenRaw: string | null,
  lastSeenBlockNumber: number | null
): Promise<ActivityDetectionResult> {
  const result: ActivityDetectionResult = {
    changed: false,
    reasons: [],
    deltas: {
      nonceChanged: false,
      ethChanged: false,
      tokenChanged: false
    },
    newStatePatch: {
      lastSeenNonce: null,
      lastSeenEthWei: null,
      lastSeenTokenRaw: null,
      lastSeenBlockNumber: null
    }
  };

  try {
    // Read current nonce
    let currentNonce: number | null = null;
    try {
      currentNonce = await ctx.publicClient.getTransactionCount({
        address: ctx.walletAddress
      });
    } catch (err) {
      logger.warn("failed to read nonce", { error: err instanceof Error ? err.message : String(err) });
    }

    // Check nonce change
    if (currentNonce !== null) {
      result.newStatePatch.lastSeenNonce = currentNonce;
      if (lastSeenNonce !== null && currentNonce !== lastSeenNonce) {
        result.deltas.nonceChanged = true;
        result.changed = true;
        result.reasons.push(`nonce increased: ${lastSeenNonce} → ${currentNonce}`);
      }
    }

    // Read current ETH balance
    let currentEthWei = 0n;
    try {
      currentEthWei = await ctx.publicClient.getBalance({
        address: ctx.walletAddress
      });
    } catch (err) {
      logger.warn("failed to read ETH balance in watcher", { error: err instanceof Error ? err.message : String(err) });
    }

    const currentEthWeiStr = currentEthWei.toString();
    result.newStatePatch.lastSeenEthWei = currentEthWeiStr;

    if (lastSeenEthWei !== null) {
      const lastEthWei = BigInt(lastSeenEthWei);
      const delta = currentEthWei - lastEthWei;
      const absDelta = delta < 0n ? -delta : delta;
      if (absDelta >= ctx.minEthDeltaWei) {
        result.deltas.ethChanged = true;
        result.deltas.ethDelta = `${absDelta.toString()} wei`;
        result.changed = true;
        result.reasons.push(`ETH balance changed by ${absDelta.toString()} wei`);
      }
    }

    // Read current token balance
    let currentTokenRaw = 0n;
    if (ctx.tokenAddress) {
      try {
        currentTokenRaw = await ctx.publicClient.readContract({
          address: ctx.tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [ctx.walletAddress]
        });
      } catch (err) {
        logger.warn("failed to read token balance in watcher", { error: err instanceof Error ? err.message : String(err) });
      }
    }

    const currentTokenRawStr = currentTokenRaw.toString();
    result.newStatePatch.lastSeenTokenRaw = currentTokenRawStr;

    if (ctx.tokenAddress && lastSeenTokenRaw !== null) {
      const lastTokenRaw = BigInt(lastSeenTokenRaw);
      const delta = currentTokenRaw - lastTokenRaw;
      const absDelta = delta < 0n ? -delta : delta;
      if (absDelta >= ctx.minTokenDeltaRaw) {
        result.deltas.tokenChanged = true;
        result.deltas.tokenDelta = `${absDelta.toString()} raw`;
        result.changed = true;
        result.reasons.push(`Token balance changed by ${absDelta.toString()} raw`);
      }
    }

    // TODO: Optional log scanning for Transfer events since lastSeenBlockNumber
    // For now, skip this as it's optional and complex.

    // Update block number for future reference
    try {
      const blockNumber = await ctx.publicClient.getBlockNumber();
      result.newStatePatch.lastSeenBlockNumber = Number(blockNumber);
    } catch (err) {
      logger.warn("failed to read block number in watcher", { error: err instanceof Error ? err.message : String(err) });
    }
  } catch (err) {
    logger.warn("watchForActivity caught error", { error: err instanceof Error ? err.message : String(err) });
  }

  return result;
}

/**
 * Helper: parse MIN_ETH_DELTA from config (in ETH, convert to wei)
 */
export function parseMinEthDelta(ethStr: string): bigint {
  try {
    return parseEther(ethStr);
  } catch {
    logger.warn("failed to parse MIN_ETH_DELTA, using default 0.00001", { ethStr });
    return parseEther("0.00001");
  }
}

/**
 * Helper: parse MIN_TOKEN_DELTA from config (raw units, respecting decimals)
 */
export function parseMinTokenDelta(tokenStr: string, decimals: number): bigint {
  try {
    const amount = BigInt(tokenStr);
    return amount * BigInt(10 ** decimals);
  } catch {
    logger.warn("failed to parse MIN_TOKEN_DELTA, using default 1000", { tokenStr, decimals });
    return BigInt(1000) * BigInt(10 ** decimals);
  }
}

/**
 * LP Manager — Autonomous liquidity provision decisions.
 *
 * Runs once per tick (when LP_ENABLED=true) and:
 *  1. Reads pool reserves and agent balances
 *  2. Decides whether to add liquidity (auto-seed)
 *  3. Stakes unstaked LP tokens in gauges (if configured)
 *  4. Returns pool stats for social posting
 *
 * Respects all guardrails: DRY_RUN, KILL_SWITCH, LP caps.
 */

import { parseEther, formatEther, type Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "../chain/client.js";
import type { AgentState } from "./state.js";
import {
  readPoolStats,
  addLiquidityETH,
  resolveUsdcPool,
  type PoolStats,
  type LPAddResult,
} from "../chain/liquidity.js";
import {
  readStakedBalance,
  readEarnedRewards,
  stakeLP,
  claimRewards,
} from "../chain/gauge.js";
import { readLPBalance } from "../chain/aerodrome.js";
import { readErc20Balance, readEthBalance } from "../chain/erc20.js";
import { logger } from "../logger.js";

// ============================================================
// TYPES
// ============================================================

export type LPTickResult = {
  /** Whether LP operations ran (vs skipped) */
  ran: boolean;
  /** Pool stats for social posting */
  wethPool: PoolStats | null;
  usdcPool: PoolStats | null;
  /** LP operations performed this tick */
  actions: LPAction[];
  /** Gauge info */
  gauge: {
    wethStaked: bigint;
    wethEarned: bigint;
    usdcStaked: bigint;
    usdcEarned: bigint;
  };
  /** Skip reason if ran=false */
  skipReason?: string;
};

export type LPAction = {
  type: "add_liquidity_eth" | "add_liquidity_erc20" | "stake_gauge" | "claim_rewards";
  pool: string;
  txHash?: string;
  amount?: string;
  dryRun: boolean;
};

// ============================================================
// MAIN TICK
// ============================================================

/**
 * Run the LP management tick.
 * Called from the main agent loop when LP_ENABLED=true.
 */
export async function lpTick(
  cfg: AppConfig,
  clients: ChainClients,
  tokenAddress: Address,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>
): Promise<LPTickResult> {
  const nullResult = (reason: string): LPTickResult => ({
    ran: false,
    wethPool: null,
    usdcPool: null,
    actions: [],
    gauge: { wethStaked: 0n, wethEarned: 0n, usdcStaked: 0n, usdcEarned: 0n },
    skipReason: reason,
  });

  // Guard: LP must be enabled
  if (!cfg.LP_ENABLED) return nullResult("lp_disabled");
  if (cfg.KILL_SWITCH) return nullResult("kill_switch");

  const wallet = clients.walletClient?.account?.address;
  if (!wallet) return nullResult("no_wallet");

  const wethAddress = cfg.WETH_ADDRESS as Address | undefined;
  if (!wethAddress) return nullResult("no_weth_address");

  const routerAddress = cfg.ROUTER_ADDRESS as Address | undefined;
  if (!routerAddress) return nullResult("no_router");

  const actions: LPAction[] = [];

  // ----------------------------------------------------------
  // 1. READ POOL STATS
  // ----------------------------------------------------------

  // INTERN/WETH pool
  let wethPool: PoolStats | null = null;
  if (cfg.POOL_ADDRESS) {
    wethPool = await readPoolStats(
      clients,
      cfg.POOL_ADDRESS as Address,
      wallet,
      wethAddress,
      "INTERN/WETH",
      cfg.AERODROME_STABLE
    );
    if (wethPool) {
      logger.info("lp.wethPool.stats", {
        tvlWei: wethPool.tvlWei.toString(),
        lpBalance: wethPool.lpBalance.toString(),
        sharePercent: wethPool.sharePercent.toFixed(2),
        reserve0: wethPool.reserve0.toString(),
        reserve1: wethPool.reserve1.toString(),
      });
    }
  }

  // INTERN/USDC pool
  let usdcPool: PoolStats | null = null;
  const usdcAddress = cfg.USDC_ADDRESS as Address;
  let usdcPoolAddress = cfg.POOL_ADDRESS_USDC as Address | undefined;

  // Discover USDC pool if not configured
  if (!usdcPoolAddress && usdcAddress) {
    const discovered = await resolveUsdcPool(
      clients,
      tokenAddress,
      usdcAddress,
      cfg.POOL_ADDRESS_USDC_STABLE ?? false
    );
    if (discovered) {
      usdcPoolAddress = discovered;
      logger.info("lp.usdcPool.discovered", { poolAddress: discovered });
    }
  }

  if (usdcPoolAddress) {
    usdcPool = await readPoolStats(
      clients,
      usdcPoolAddress,
      wallet,
      wethAddress,
      "INTERN/USDC",
      cfg.POOL_ADDRESS_USDC_STABLE ?? false
    );
    if (usdcPool) {
      logger.info("lp.usdcPool.stats", {
        tvlWei: usdcPool.tvlWei.toString(),
        lpBalance: usdcPool.lpBalance.toString(),
        sharePercent: usdcPool.sharePercent.toFixed(2),
      });
    }
  }

  // ----------------------------------------------------------
  // 2. AUTO-SEED DECISION (INTERN/WETH)
  // ----------------------------------------------------------

  if (wethPool && cfg.POOL_ADDRESS) {
    const autoSeedAction = await evaluateAutoSeed(
      cfg, clients, tokenAddress, wethAddress, wallet, wethPool, state
    );
    if (autoSeedAction) {
      actions.push(autoSeedAction);
    }
  }

  // ----------------------------------------------------------
  // 3. GAUGE STAKING
  // ----------------------------------------------------------

  let wethStaked = 0n;
  let wethEarned = 0n;
  let usdcStaked = 0n;
  let usdcEarned = 0n;

  // WETH pool gauge
  const wethGauge = cfg.GAUGE_ADDRESS_WETH as Address | undefined;
  if (wethGauge && cfg.POOL_ADDRESS) {
    const gaugeActions = await handleGauge(
      clients,
      wethGauge,
      cfg.POOL_ADDRESS as Address,
      wallet,
      "INTERN/WETH",
      cfg.DRY_RUN
    );
    actions.push(...gaugeActions.actions);
    wethStaked = gaugeActions.staked;
    wethEarned = gaugeActions.earned;
  }

  // USDC pool gauge
  const usdcGauge = cfg.GAUGE_ADDRESS_USDC as Address | undefined;
  if (usdcGauge && usdcPoolAddress) {
    const gaugeActions = await handleGauge(
      clients,
      usdcGauge,
      usdcPoolAddress,
      wallet,
      "INTERN/USDC",
      cfg.DRY_RUN
    );
    actions.push(...gaugeActions.actions);
    usdcStaked = gaugeActions.staked;
    usdcEarned = gaugeActions.earned;
  }

  // ----------------------------------------------------------
  // 4. SAVE STATE
  // ----------------------------------------------------------

  const nextState: AgentState = {
    ...state,
    lpLastTickMs: Date.now(),
    lpWethPoolTvlWei: wethPool?.tvlWei.toString() ?? null,
    lpUsdcPoolTvlWei: usdcPool?.tvlWei.toString() ?? null,
  };
  await saveStateFn(nextState);

  return {
    ran: true,
    wethPool,
    usdcPool,
    actions,
    gauge: { wethStaked, wethEarned, usdcStaked, usdcEarned },
  };
}

// ============================================================
// AUTO-SEED EVALUATION
// ============================================================

async function evaluateAutoSeed(
  cfg: AppConfig,
  clients: ChainClients,
  tokenAddress: Address,
  wethAddress: Address,
  wallet: Address,
  wethPool: PoolStats,
  state: AgentState
): Promise<LPAction | null> {
  // Only seed if pool TVL is below threshold (bootstrapping phase).
  // Conservative: stop seeding once pool has reasonable liquidity
  // to preserve ETH for trading and gas.
  const tvlThreshold = parseEther("0.05");
  if (wethPool.tvlWei > tvlThreshold) {
    logger.info("lp.autoSeed.skip", {
      reason: "pool_tvl_above_threshold",
      tvl: formatEther(wethPool.tvlWei),
      threshold: "0.05 ETH",
    });
    return null;
  }

  // REDEPLOY SAFETY: LP cooldown — don't add liquidity more than once
  // per LOOP_MINUTES interval. Prevents rapid-fire LP adds when two
  // replicas overlap during a zero-downtime deploy.
  const lpCooldownMs = cfg.LOOP_MINUTES * 60_000;
  const lastAddAt = state.lpLastAddAtMs ?? 0;
  const timeSinceLastAdd = Date.now() - lastAddAt;
  if (lastAddAt > 0 && timeSinceLastAdd < lpCooldownMs) {
    logger.info("lp.autoSeed.skip", {
      reason: "lp_cooldown",
      lastAddAtMs: lastAddAt,
      cooldownMs: lpCooldownMs,
      remainingSec: Math.round((lpCooldownMs - timeSinceLastAdd) / 1000),
    });
    return null;
  }

  // Check agent balances
  const [ethBalance, tokenBalance] = await Promise.all([
    readEthBalance(clients, wallet),
    readErc20Balance(clients, tokenAddress, wallet),
  ]);

  const maxEthPerAdd = parseEther(cfg.LP_MAX_ETH_PER_ADD ?? "0.001");
  const maxTokenBps = cfg.LP_MAX_TOKEN_FRACTION_BPS ?? 1000;

  // Keep a healthy ETH reserve for trading + gas. Never seed into LP
  // if it would leave the wallet unable to trade or pay gas.
  const gasReserve = parseEther("0.005");
  const availableEth = ethBalance > gasReserve ? ethBalance - gasReserve : 0n;
  if (availableEth <= 0n) {
    logger.info("lp.autoSeed.skip", {
      reason: "insufficient_eth",
      ethBalance: formatEther(ethBalance),
    });
    return null;
  }

  // Calculate amounts
  const ethToAdd = availableEth < maxEthPerAdd ? availableEth : maxEthPerAdd;
  const maxTokenAmount = (tokenBalance * BigInt(maxTokenBps)) / 10000n;

  if (maxTokenAmount <= 0n) {
    logger.info("lp.autoSeed.skip", {
      reason: "insufficient_token",
      tokenBalance: tokenBalance.toString(),
    });
    return null;
  }

  // Calculate proportional INTERN amount based on pool reserves
  // If pool is empty, use a generous ratio
  let tokenToAdd: bigint;
  if (wethPool.reserve0 > 0n && wethPool.reserve1 > 0n) {
    // Match pool ratio
    const token0Lower = wethPool.poolAddress; // This is approximate
    // For simplicity, assume we need to match the ETH:TOKEN ratio from reserves
    // tvlWei = 2 * wethReserve, so wethReserve ≈ tvlWei / 2
    const wethReserve = wethPool.tvlWei / 2n;
    const tokenReserve = wethPool.reserve0 > wethReserve
      ? wethPool.reserve0 : wethPool.reserve1;

    if (wethReserve > 0n) {
      tokenToAdd = (ethToAdd * tokenReserve) / wethReserve;
    } else {
      tokenToAdd = maxTokenAmount;
    }
  } else {
    // Empty pool — use max allowed
    tokenToAdd = maxTokenAmount;
  }

  // Cap at max allowed
  if (tokenToAdd > maxTokenAmount) {
    tokenToAdd = maxTokenAmount;
  }

  if (tokenToAdd <= 0n) {
    return null;
  }

  logger.info("lp.autoSeed.propose", {
    ethToAdd: formatEther(ethToAdd),
    tokenToAdd: tokenToAdd.toString(),
    dryRun: cfg.DRY_RUN,
  });

  if (cfg.DRY_RUN) {
    logger.info("lp.autoSeed.dryRun", {
      ethToAdd: formatEther(ethToAdd),
      tokenToAdd: tokenToAdd.toString(),
    });
    return {
      type: "add_liquidity_eth",
      pool: "INTERN/WETH",
      amount: formatEther(ethToAdd),
      dryRun: true,
    };
  }

  // REDEPLOY SAFETY: Nonce guard — check wallet nonce before LP execution.
  // If nonce changed since tick start, another replica may have sent a tx.
  try {
    const currentNonce = await clients.publicClient.getTransactionCount({
      address: wallet,
    });
    const expectedNonce = state.lastSeenNonce;
    if (expectedNonce !== null && currentNonce !== expectedNonce) {
      logger.warn("lp.autoSeed.skip", {
        reason: "nonce_changed",
        expectedNonce,
        currentNonce,
      });
      return null;
    }
  } catch {
    // Non-critical: proceed if nonce check fails
  }

  // Execute LP add
  try {
    const result = await addLiquidityETH(
      cfg, clients, tokenAddress, tokenToAdd, ethToAdd
    );

    // Record LP add timestamp for cooldown (persisted in state by caller)
    state.lpLastAddAtMs = Date.now();

    return {
      type: "add_liquidity_eth",
      pool: "INTERN/WETH",
      txHash: result.txHash,
      amount: formatEther(ethToAdd),
      dryRun: false,
    };
  } catch (err) {
    logger.error("lp.autoSeed.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ============================================================
// GAUGE HANDLER
// ============================================================

async function handleGauge(
  clients: ChainClients,
  gaugeAddress: Address,
  poolAddress: Address,
  wallet: Address,
  poolLabel: string,
  dryRun: boolean
): Promise<{ actions: LPAction[]; staked: bigint; earned: bigint }> {
  const actions: LPAction[] = [];

  const [staked, earned, unstaked] = await Promise.all([
    readStakedBalance(clients, gaugeAddress, wallet),
    readEarnedRewards(clients, gaugeAddress, wallet),
    readLPBalance(clients, poolAddress, wallet),
  ]);

  logger.info("lp.gauge.status", {
    pool: poolLabel,
    staked: staked.toString(),
    earned: earned.toString(),
    unstaked: unstaked.toString(),
  });

  // Auto-stake unstaked LP tokens
  if (unstaked > 0n) {
    if (dryRun) {
      logger.info("lp.gauge.stake.dryRun", {
        pool: poolLabel,
        amount: unstaked.toString(),
      });
      actions.push({
        type: "stake_gauge",
        pool: poolLabel,
        amount: unstaked.toString(),
        dryRun: true,
      });
    } else {
      try {
        const txHash = await stakeLP(clients, gaugeAddress, poolAddress, unstaked);
        actions.push({
          type: "stake_gauge",
          pool: poolLabel,
          txHash,
          amount: unstaked.toString(),
          dryRun: false,
        });
      } catch (err) {
        logger.error("lp.gauge.stake.failed", {
          pool: poolLabel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Claim rewards if earned > 0
  if (earned > 0n) {
    if (dryRun) {
      logger.info("lp.gauge.claim.dryRun", {
        pool: poolLabel,
        earned: earned.toString(),
      });
      actions.push({
        type: "claim_rewards",
        pool: poolLabel,
        amount: earned.toString(),
        dryRun: true,
      });
    } else {
      try {
        const txHash = await claimRewards(clients, gaugeAddress);
        actions.push({
          type: "claim_rewards",
          pool: poolLabel,
          txHash,
          amount: earned.toString(),
          dryRun: false,
        });
      } catch (err) {
        logger.error("lp.gauge.claim.failed", {
          pool: poolLabel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { actions, staked, earned };
}

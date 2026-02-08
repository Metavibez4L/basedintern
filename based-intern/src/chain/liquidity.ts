/**
 * Aerodrome Liquidity Provision — Add / Remove liquidity for INTERN pools.
 *
 * Supports:
 *  - INTERN/WETH via addLiquidityETH (native ETH on one side)
 *  - INTERN/USDC via addLiquidity (two ERC20 tokens)
 *  - removeLiquidityETH for withdrawing INTERN/WETH LP
 *
 * Guardrails:
 *  - LP_ENABLED master switch
 *  - LP_MAX_ETH_PER_ADD cap
 *  - LP_MAX_TOKEN_FRACTION_BPS cap (% of INTERN holdings)
 *  - LP_SLIPPAGE_BPS slippage tolerance
 *  - Respects DRY_RUN and KILL_SWITCH
 */

import { maxUint256, type Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";
import {
  readAerodromePool,
  readLPBalance,
  readLPTotalSupply,
  calculatePoolTVL,
  buildAddLiquidityETHCalldata,
  buildAddLiquidityCalldata,
  buildRemoveLiquidityETHCalldata,
  applySlippage,
  queryAerodromePool,
  type AerodromePoolInfo,
} from "./aerodrome.js";
import { readErc20Balance, readAllowance, approveToken } from "./erc20.js";
import { logger } from "../logger.js";

// ============================================================
// TYPES
// ============================================================

export type PoolStats = {
  poolAddress: Address;
  pairLabel: string; // e.g. "INTERN/WETH"
  reserve0: bigint;
  reserve1: bigint;
  tvlWei: bigint;
  lpBalance: bigint;
  lpTotalSupply: bigint;
  sharePercent: number; // Agent's share of the pool (0-100)
};

export type LPAddResult = {
  txHash: `0x${string}`;
  pool: string;
  ethAmount?: string;
  tokenAmount?: string;
};

// ============================================================
// READ OPERATIONS
// ============================================================

/**
 * Read pool stats for a given pool address.
 * Returns null if pool is unreadable.
 */
export async function readPoolStats(
  clients: ChainClients,
  poolAddress: Address,
  wallet: Address,
  wethAddress: Address,
  pairLabel: string,
  stable: boolean
): Promise<PoolStats | null> {
  const pool = await readAerodromePool(clients, poolAddress, stable);
  if (!pool) return null;

  const [lpBalance, lpTotalSupply] = await Promise.all([
    readLPBalance(clients, poolAddress, wallet),
    readLPTotalSupply(clients, poolAddress),
  ]);

  const { tvlWei } = calculatePoolTVL(pool, wethAddress);
  const sharePercent = lpTotalSupply > 0n
    ? Number((lpBalance * 10000n) / lpTotalSupply) / 100
    : 0;

  return {
    poolAddress,
    pairLabel,
    reserve0: pool.reserve0,
    reserve1: pool.reserve1,
    tvlWei,
    lpBalance,
    lpTotalSupply,
    sharePercent,
  };
}

/**
 * Discover or validate INTERN/USDC pool address.
 * If POOL_ADDRESS_USDC is set, use it. Otherwise query the Aerodrome factory.
 */
export async function resolveUsdcPool(
  clients: ChainClients,
  tokenAddress: Address,
  usdcAddress: Address,
  stable: boolean,
  factoryAddress: Address = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da"
): Promise<Address | null> {
  return queryAerodromePool(clients, factoryAddress, tokenAddress, usdcAddress, stable);
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

/**
 * Ensure ERC20 allowance for router, approving if needed.
 */
async function ensureRouterAllowance(
  clients: ChainClients,
  token: Address,
  wallet: Address,
  router: Address,
  requiredAmount: bigint,
  approveMax: boolean
): Promise<void> {
  if (!clients.walletClient) throw new Error("wallet client required for LP operations");

  const currentAllowance = await readAllowance(
    clients.publicClient as any,
    token,
    wallet,
    router
  );

  if (currentAllowance >= requiredAmount) {
    logger.info("lp.allowance.sufficient", {
      token,
      current: currentAllowance.toString(),
      required: requiredAmount.toString(),
    });
    return;
  }

  const approveAmount = approveMax ? maxUint256 : requiredAmount;
  logger.info("lp.allowance.approving", {
    token,
    amount: approveAmount.toString(),
    approveMax,
  });

  await approveToken(
    clients.walletClient,
    clients.publicClient as any,
    token,
    router,
    approveAmount
  );
}

/**
 * Add liquidity to INTERN/WETH pool via addLiquidityETH.
 *
 * The caller provides the desired ETH amount (spendEth) and INTERN amount.
 * The function handles slippage calculation, approval, and submission.
 */
export async function addLiquidityETH(
  cfg: AppConfig,
  clients: ChainClients,
  token: Address,
  amountTokenDesired: bigint,
  amountETH: bigint
): Promise<LPAddResult> {
  if (!clients.walletClient) throw new Error("wallet client required for LP");
  const wallet = clients.walletClient.account?.address;
  if (!wallet) throw new Error("wallet address not available");
  const router = cfg.ROUTER_ADDRESS as Address;
  if (!router) throw new Error("ROUTER_ADDRESS required for LP");

  const slippageBps = cfg.LP_SLIPPAGE_BPS ?? 500;

  logger.info("lp.addLiquidityETH.start", {
    token,
    amountTokenDesired: amountTokenDesired.toString(),
    amountETH: amountETH.toString(),
    slippageBps,
  });

  // Approve INTERN for router
  await ensureRouterAllowance(clients, token, wallet, router, amountTokenDesired, cfg.APPROVE_MAX);

  const amountTokenMin = applySlippage(amountTokenDesired, slippageBps);
  const amountETHMin = applySlippage(amountETH, slippageBps);

  const { calldata, deadline } = buildAddLiquidityETHCalldata({
    token,
    stable: cfg.AERODROME_STABLE,
    amountTokenDesired,
    amountTokenMin,
    amountETHMin,
    to: wallet,
    deadlineSeconds: 600,
  });

  const txHash = await clients.walletClient.sendTransaction({
    to: router,
    data: calldata,
    value: amountETH, // Send the full desired ETH (router refunds excess)
    account: wallet,
    chain: undefined,
  });

  logger.info("lp.addLiquidityETH.submitted", {
    txHash,
    amountETH: amountETH.toString(),
    amountToken: amountTokenDesired.toString(),
    deadline: deadline.toString(),
  });

  return {
    txHash,
    pool: "INTERN/WETH",
    ethAmount: amountETH.toString(),
    tokenAmount: amountTokenDesired.toString(),
  };
}

/**
 * Add liquidity to INTERN/USDC pool via addLiquidity.
 * Both sides are ERC20 tokens — requires approval for both.
 */
export async function addLiquidityERC20(
  cfg: AppConfig,
  clients: ChainClients,
  tokenA: Address,
  tokenB: Address,
  amountADesired: bigint,
  amountBDesired: bigint,
  stable: boolean
): Promise<LPAddResult> {
  if (!clients.walletClient) throw new Error("wallet client required for LP");
  const wallet = clients.walletClient.account?.address;
  if (!wallet) throw new Error("wallet address not available");
  const router = cfg.ROUTER_ADDRESS as Address;
  if (!router) throw new Error("ROUTER_ADDRESS required for LP");

  const slippageBps = cfg.LP_SLIPPAGE_BPS ?? 500;

  logger.info("lp.addLiquidity.start", {
    tokenA,
    tokenB,
    amountA: amountADesired.toString(),
    amountB: amountBDesired.toString(),
    stable,
    slippageBps,
  });

  // Approve both tokens for router
  await Promise.all([
    ensureRouterAllowance(clients, tokenA, wallet, router, amountADesired, cfg.APPROVE_MAX),
    ensureRouterAllowance(clients, tokenB, wallet, router, amountBDesired, cfg.APPROVE_MAX),
  ]);

  const amountAMin = applySlippage(amountADesired, slippageBps);
  const amountBMin = applySlippage(amountBDesired, slippageBps);

  const { calldata, deadline } = buildAddLiquidityCalldata({
    tokenA,
    tokenB,
    stable,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    to: wallet,
    deadlineSeconds: 600,
  });

  const txHash = await clients.walletClient.sendTransaction({
    to: router,
    data: calldata,
    account: wallet,
    chain: undefined,
  });

  logger.info("lp.addLiquidity.submitted", {
    txHash,
    tokenA,
    tokenB,
    amountA: amountADesired.toString(),
    amountB: amountBDesired.toString(),
    deadline: deadline.toString(),
  });

  return {
    txHash,
    pool: "INTERN/USDC",
    tokenAmount: amountADesired.toString(),
  };
}

/**
 * Remove liquidity from INTERN/WETH pool.
 */
export async function removeLiquidityETH(
  cfg: AppConfig,
  clients: ChainClients,
  token: Address,
  poolAddress: Address,
  liquidityAmount: bigint
): Promise<`0x${string}`> {
  if (!clients.walletClient) throw new Error("wallet client required for LP");
  const wallet = clients.walletClient.account?.address;
  if (!wallet) throw new Error("wallet address not available");
  const router = cfg.ROUTER_ADDRESS as Address;
  if (!router) throw new Error("ROUTER_ADDRESS required for LP");

  logger.info("lp.removeLiquidityETH.start", {
    token,
    poolAddress,
    liquidity: liquidityAmount.toString(),
  });

  // Approve LP tokens for router
  await ensureRouterAllowance(clients, poolAddress, wallet, router, liquidityAmount, false);

  const { calldata, deadline } = buildRemoveLiquidityETHCalldata({
    token,
    stable: cfg.AERODROME_STABLE,
    liquidity: liquidityAmount,
    amountTokenMin: 0n, // Accept any amount (emergency withdrawal)
    amountETHMin: 0n,
    to: wallet,
    deadlineSeconds: 600,
  });

  const txHash = await clients.walletClient.sendTransaction({
    to: router,
    data: calldata,
    account: wallet,
    chain: undefined,
  });

  logger.info("lp.removeLiquidityETH.submitted", {
    txHash,
    liquidity: liquidityAmount.toString(),
    deadline: deadline.toString(),
  });

  return txHash;
}

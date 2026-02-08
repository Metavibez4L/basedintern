/**
 * Aerodrome Gauge Staking — Stake LP tokens to earn AERO rewards.
 *
 * Aerodrome gauges accept LP tokens and distribute AERO emissions
 * proportionally to stakers. This module handles:
 *  - stakeLP: deposit LP tokens into gauge
 *  - unstakeLP: withdraw LP tokens from gauge
 *  - claimRewards: claim earned AERO
 *  - readStakedBalance: check staked LP amount
 *  - readEarnedRewards: check pending AERO rewards
 */

import { parseAbi, type Address } from "viem";
import type { ChainClients } from "./client.js";
import { readAllowance, approveToken } from "./erc20.js";
import { logger } from "../logger.js";
import { maxUint256 } from "viem";

// Aerodrome Gauge ABI (subset)
const GAUGE_ABI = parseAbi([
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function getReward(address account) external",
  "function balanceOf(address account) public view returns (uint256)",
  "function earned(address account) public view returns (uint256)",
  "function rewardToken() public view returns (address)",
]);

// ============================================================
// READ OPERATIONS
// ============================================================

/**
 * Read the staked LP balance for a wallet in a gauge.
 */
export async function readStakedBalance(
  clients: ChainClients,
  gaugeAddress: Address,
  wallet: Address
): Promise<bigint> {
  try {
    return await clients.publicClient.readContract({
      address: gaugeAddress,
      abi: GAUGE_ABI,
      functionName: "balanceOf",
      args: [wallet],
    });
  } catch (err) {
    logger.warn("gauge.readStakedBalance.error", {
      gauge: gaugeAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0n;
  }
}

/**
 * Read pending AERO rewards for a wallet in a gauge.
 */
export async function readEarnedRewards(
  clients: ChainClients,
  gaugeAddress: Address,
  wallet: Address
): Promise<bigint> {
  try {
    return await clients.publicClient.readContract({
      address: gaugeAddress,
      abi: GAUGE_ABI,
      functionName: "earned",
      args: [wallet],
    });
  } catch (err) {
    logger.warn("gauge.readEarnedRewards.error", {
      gauge: gaugeAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0n;
  }
}

/**
 * Read the reward token address (should be AERO).
 */
export async function readRewardToken(
  clients: ChainClients,
  gaugeAddress: Address
): Promise<Address | null> {
  try {
    return await clients.publicClient.readContract({
      address: gaugeAddress,
      abi: GAUGE_ABI,
      functionName: "rewardToken",
    });
  } catch {
    return null;
  }
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

/**
 * Stake LP tokens into an Aerodrome gauge.
 * Requires approval of LP tokens for the gauge address.
 */
export async function stakeLP(
  clients: ChainClients,
  gaugeAddress: Address,
  lpTokenAddress: Address,
  amount: bigint,
  approveMax: boolean = false
): Promise<`0x${string}`> {
  if (!clients.walletClient) throw new Error("wallet client required for gauge staking");
  const account = clients.walletClient.account;
  const wallet = account?.address;
  if (!wallet || !account) throw new Error("wallet address not available");

  logger.info("gauge.stakeLP.start", {
    gauge: gaugeAddress,
    lpToken: lpTokenAddress,
    amount: amount.toString(),
  });

  // Ensure LP token allowance for gauge
  const currentAllowance = await readAllowance(
    clients.publicClient as any,
    lpTokenAddress,
    wallet,
    gaugeAddress
  );

  if (currentAllowance < amount) {
    const approveAmount = approveMax ? maxUint256 : amount;
    logger.info("gauge.stakeLP.approving", {
      lpToken: lpTokenAddress,
      amount: approveAmount.toString(),
    });
    await approveToken(
      clients.walletClient,
      clients.publicClient as any,
      lpTokenAddress,
      gaugeAddress,
      approveAmount
    );
  }

  // Deposit into gauge
  const txHash = await clients.walletClient.writeContract({
    address: gaugeAddress,
    abi: GAUGE_ABI,
    functionName: "deposit",
    args: [amount],
    account,
    chain: undefined as any,
  });

  logger.info("gauge.stakeLP.submitted", {
    txHash,
    gauge: gaugeAddress,
    amount: amount.toString(),
  });

  return txHash;
}

/**
 * Unstake LP tokens from an Aerodrome gauge.
 */
export async function unstakeLP(
  clients: ChainClients,
  gaugeAddress: Address,
  amount: bigint
): Promise<`0x${string}`> {
  if (!clients.walletClient) throw new Error("wallet client required for gauge unstaking");
  const account = clients.walletClient.account;
  const wallet = account?.address;
  if (!wallet || !account) throw new Error("wallet address not available");

  logger.info("gauge.unstakeLP.start", {
    gauge: gaugeAddress,
    amount: amount.toString(),
  });

  const txHash = await clients.walletClient.writeContract({
    address: gaugeAddress,
    abi: GAUGE_ABI,
    functionName: "withdraw",
    args: [amount],
    account,
    chain: undefined as any,
  });

  logger.info("gauge.unstakeLP.submitted", {
    txHash,
    gauge: gaugeAddress,
    amount: amount.toString(),
  });

  return txHash;
}

/**
 * Claim pending AERO rewards from a gauge.
 */
export async function claimRewards(
  clients: ChainClients,
  gaugeAddress: Address
): Promise<`0x${string}`> {
  if (!clients.walletClient) throw new Error("wallet client required for claiming rewards");
  const account = clients.walletClient.account;
  const wallet = account?.address;
  if (!wallet || !account) throw new Error("wallet address not available");

  logger.info("gauge.claimRewards.start", { gauge: gaugeAddress });

  const txHash = await clients.walletClient.writeContract({
    address: gaugeAddress,
    abi: GAUGE_ABI,
    functionName: "getReward",
    args: [wallet],
    account,
    chain: undefined as any,
  });

  logger.info("gauge.claimRewards.submitted", { txHash, gauge: gaugeAddress });

  return txHash;
}

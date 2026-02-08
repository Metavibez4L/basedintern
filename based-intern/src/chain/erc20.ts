import { erc20Abi, type Address, type PublicClient, type WalletClient } from "viem";
import type { ChainClients } from "./client.js";

export async function readEthBalance(clients: ChainClients, address: Address): Promise<bigint> {
  return clients.publicClient.getBalance({ address });
}

export async function readErc20Decimals(clients: ChainClients, token: Address): Promise<number> {
  return clients.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals"
  });
}

export async function readErc20Balance(clients: ChainClients, token: Address, owner: Address): Promise<bigint> {
  return clients.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner]
  });
}

/**
 * Read the ERC20 allowance for a spender
 */
export async function readAllowance(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  spender: Address
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender]
  });
}

/**
 * Approve an ERC20 spender
 * Returns the transaction hash
 */
export async function approveToken(
  walletClient: WalletClient,
  publicClient: PublicClient,
  token: Address,
  spender: Address,
  amount: bigint
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) {
    throw new Error("wallet account not available for approval");
  }

  const txHash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account,
    chain: undefined as any
  });

  // Wait for the approval to be mined before returning.
  // Without this, subsequent calls (addLiquidity, swap) that simulate
  // against current chain state will revert because the allowance
  // hasn't been updated yet.
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}


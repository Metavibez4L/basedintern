import { erc20Abi, type Address } from "viem";
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


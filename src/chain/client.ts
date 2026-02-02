import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config.js";
import { rpcUrlForChain } from "../config.js";
import { viemChain } from "./chains.js";
import { logger } from "../logger.js";

export type ChainClients = {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient> | null;
  walletAddress: Address;
};

export function createChainClients(cfg: AppConfig): ChainClients {
  const url = rpcUrlForChain(cfg);
  if (!url) throw new Error("RPC URL missing. Set RPC_URL or BASE_SEPOLIA_RPC_URL/BASE_RPC_URL.");

  const chain = viemChain(cfg.CHAIN);
  const transport = http(url);

  const publicClient = createPublicClient({ chain, transport });

  if (cfg.WALLET_MODE === "cdp") {
    // Optional/experimental: do not block running.
    logger.warn("WALLET_MODE=cdp is experimental; running read-only unless implemented.", {
      walletMode: "cdp"
    });
    const walletAddress = "0x0000000000000000000000000000000000000000" as Address;
    return { publicClient, walletClient: null, walletAddress };
  }

  const pk = cfg.PRIVATE_KEY as `0x${string}` | string;
  const key = pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`);
  const account = privateKeyToAccount(key);

  const walletClient = createWalletClient({ chain, transport, account });
  return { publicClient, walletClient, walletAddress: account.address };
}


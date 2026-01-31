import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";
import { getDexProviders } from "./dex/index.js";

export type PriceResult = {
  text: string | null; // null => unknown
  source: string;
};

/**
 * Best-effort price lookup using registered DEX providers.
 *
 * Providers can register themselves (e.g., Aerodrome adapter). The first
 * provider that returns a non-null PriceResult will be used.
 */
export async function readBestEffortPrice(
  cfg: AppConfig,
  clients: ChainClients,
  token: Address
): Promise<PriceResult> {
  const providers = getDexProviders();
  if (!providers || providers.length === 0) return { text: null, source: "unknown" };

  const wethAddress = (cfg.WETH_ADDRESS ?? "").toString();
  for (const p of providers) {
    try {
      const out = await p.getPrice(cfg, clients, token, wethAddress as Address);
      if (out) return out;
    } catch {
      // provider failure -> try next
      continue;
    }
  }

  return { text: null, source: "unknown" };
}


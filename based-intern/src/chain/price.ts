import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";
import { readAerodromePool, calculateAerodromeOutput } from "./aerodrome.js";

export type PriceResult = {
  text: string | null; // null => unknown
  source: string;
};

/**
 * Best-effort price lookup using Aerodrome pools (if configured).
 *
 * If POOL_ADDRESS is set and ROUTER_TYPE=aerodrome, queries the Aerodrome pool
 * for token reserves and calculates the price of INTERN in ETH.
 *
 * Falls back to "unknown" if pool is not configured or query fails.
 */
export async function readBestEffortPrice(
  cfg: AppConfig,
  clients: ChainClients,
  token: Address
): Promise<PriceResult> {
  // Only attempt price lookup if Aerodrome is configured
  if (cfg.ROUTER_TYPE !== "aerodrome" || !cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS) {
    return { text: null, source: "unknown" };
  }

  try {
    const poolAddress = cfg.POOL_ADDRESS as Address;
    const wethAddress = cfg.WETH_ADDRESS as Address;

    // Read pool info
    const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
    if (!pool) {
      return { text: null, source: "aerodrome_unavailable" };
    }

    // Determine token order in pool
    const token0 = pool.token0.toLowerCase();
    const tokenLower = token.toLowerCase();
    const wethLower = wethAddress.toLowerCase();

    let tokenReserve: bigint;
    let wethReserve: bigint;

    if (token0 === tokenLower) {
      tokenReserve = pool.reserve0;
      wethReserve = pool.reserve1;
    } else if (token0 === wethLower) {
      tokenReserve = pool.reserve1;
      wethReserve = pool.reserve0;
    } else {
      return { text: null, source: "aerodrome_mismatch" };
    }

    if (tokenReserve <= 0n || wethReserve <= 0n) {
      return { text: null, source: "aerodrome_empty" };
    }

    // Calculate price: 1 INTERN = X ETH
    // Price = wethReserve / tokenReserve
    // For display, we scale to 18 decimals
    const price = (wethReserve * BigInt(10 ** 18)) / tokenReserve;
    const priceEth = Number(price) / 10 ** 18;

    return {
      text: `$${priceEth.toFixed(6)} ETH`,
      source: "aerodrome"
    };
  } catch (err) {
    return { text: null, source: "aerodrome_error" };
  }
}


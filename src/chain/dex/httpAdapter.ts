import type { Address } from "viem";
import type { AppConfig } from "../../config.js";
import type { ChainClients } from "../client.js";
import { registerDexProvider } from "./index.js";
import { logger } from "../../logger.js";

/**
 * HTTP-based price provider (fallback when pool is unavailable).
 * Uses CoinGecko free API (no auth required, rate-limited but reliable).
 * Supports INTERN token by contract address lookup.
 */
export const HttpPriceAdapter = {
  name: "http-coingecko",

  getPrice: async (cfg: AppConfig, clients: ChainClients, token: Address, weth: Address) => {
    // Only use HTTP provider if no Aerodrome pool is configured
    // (if Aerodrome is available, prefer on-chain pricing)
    if (cfg.ROUTER_TYPE === "aerodrome" && cfg.POOL_ADDRESS) {
      return null; // Let Aerodrome adapter handle it
    }

    try {
      // CoinGecko free API: fetch price by contract address on Base
      // Format: https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=<addr>&vs_currencies=eth
      const tokenLower = token.toLowerCase();

      const url = `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenLower}&vs_currencies=eth`;

      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        logger.warn("http_price_fetch_failed", { status: response.status, token });
        return null;
      }

      const data = (await response.json()) as Record<string, { eth?: number }>;
      const priceData = data[tokenLower];

      if (!priceData || typeof priceData.eth !== "number" || priceData.eth <= 0) {
        logger.warn("http_price_invalid_response", { token, data: JSON.stringify(priceData) });
        return null;
      }

      const priceEth = priceData.eth;
      return {
        text: `${priceEth.toFixed(6)} ETH`,
        source: "http-coingecko"
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("http_price_error", { error: msg, token });
      return null;
    }
  }
};

// Register on import so it's available as a fallback
registerDexProvider(HttpPriceAdapter as any);

export default HttpPriceAdapter;

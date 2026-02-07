import type { Address } from "viem";
import type { AppConfig } from "../../config.js";
import type { ChainClients } from "../client.js";
import { registerDexProvider } from "./index.js";
import { logger } from "../../logger.js";
import { sleep } from "../../utils.js";

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch with retry logic and exponential backoff for transient errors
 * Retries on: 429 (rate limit), 5xx server errors, network timeouts
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number; timeoutMs?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 10000;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      // Retry on rate limit (429) or server errors (5xx)
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      // Exponential backoff: 1s, 2s, 4s...
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * HTTP-based price provider (fallback when pool is unavailable).
 * Uses CoinGecko free API (no auth required, rate-limited but reliable).
 * Supports INTERN token by contract address lookup.
 *
 * Hardened with:
 * - Timeout handling (10s default)
 * - Retry logic with exponential backoff for 429/5xx errors
 * - Proper error logging
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

      const response = await fetchWithRetry(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      }, {
        retries: 2,
        timeoutMs: 10000
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

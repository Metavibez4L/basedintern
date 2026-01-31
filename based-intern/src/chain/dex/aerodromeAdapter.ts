import type { Address } from "viem";
import type { AppConfig } from "../../config.js";
import type { ChainClients } from "../client.js";
import { registerDexProvider } from "./index.js";
import { readAerodromePool } from "../aerodrome.js";

// Adapter implementing the minimal DexProvider.getPrice contract using Aerodrome helpers.
export const AerodromeAdapter = {
  name: "aerodrome",
  getPrice: async (cfg: AppConfig, clients: ChainClients, token: Address, weth: Address) => {
    if (cfg.ROUTER_TYPE !== "aerodrome" || !cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS) return null;

    try {
      const poolAddress = cfg.POOL_ADDRESS as Address;
      const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
      if (!pool) return { text: null, source: "aerodrome_unavailable" };

      const token0 = pool.token0.toLowerCase();
      const tokenLower = token.toLowerCase();
      const wethLower = weth.toLowerCase();

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

      const price = (wethReserve * BigInt(10 ** 18)) / tokenReserve;
      const priceEth = Number(price) / 10 ** 18;

      return { text: `${priceEth.toFixed(6)} ETH`, source: "aerodrome" };
    } catch (err) {
      return { text: null, source: "aerodrome_error" };
    }
  }
};

// Register on import so price lookups pick it up by default.
registerDexProvider(AerodromeAdapter as any);

export default AerodromeAdapter;

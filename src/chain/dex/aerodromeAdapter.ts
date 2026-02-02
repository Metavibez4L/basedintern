import type { Address } from "viem";
import type { AppConfig } from "../../config.js";
import type { ChainClients } from "../client.js";
import { registerDexProvider } from "./index.js";
import { readAerodromePool, calculateAerodromeOutput, applySlippage, buildAerodromeSwapCalldata } from "../aerodrome.js";

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
  },

  buildBuyCalldata: async (
    cfg: AppConfig,
    clients: ChainClients,
    token: Address,
    weth: Address,
    wallet: Address,
    spendEth: bigint
  ) => {
    if (!cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS || !cfg.ROUTER_ADDRESS) return null;
    try {
      const poolAddress = cfg.POOL_ADDRESS as Address;
      const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
      if (!pool) return null;

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
        return null;
      }

      const expectedOutput = calculateAerodromeOutput(spendEth, wethReserve, tokenReserve, cfg.AERODROME_STABLE);
      const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

      const { calldata, deadline } = buildAerodromeSwapCalldata(
        spendEth,
        minOutput,
        {
          poolAddress,
          stable: cfg.AERODROME_STABLE,
          tokenInAddress: weth,
          tokenOutAddress: token,
          amountIn: spendEth,
          amountOutMinimum: minOutput
        },
        wallet,
        600
      );

      return { to: cfg.ROUTER_ADDRESS as Address, calldata, value: spendEth, deadline };
    } catch {
      return null;
    }
  },

  buildSellCalldata: async (
    cfg: AppConfig,
    clients: ChainClients,
    token: Address,
    weth: Address,
    wallet: Address,
    sellAmount: bigint
  ) => {
    if (!cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS || !cfg.ROUTER_ADDRESS) return null;
    try {
      const poolAddress = cfg.POOL_ADDRESS as Address;
      const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
      if (!pool) return null;

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
        return null;
      }

      const expectedOutput = calculateAerodromeOutput(sellAmount, tokenReserve, wethReserve, cfg.AERODROME_STABLE);
      const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

      const { calldata, deadline } = buildAerodromeSwapCalldata(
        sellAmount,
        minOutput,
        {
          poolAddress,
          stable: cfg.AERODROME_STABLE,
          tokenInAddress: token,
          tokenOutAddress: weth,
          amountIn: sellAmount,
          amountOutMinimum: minOutput
        },
        wallet,
        600
      );

      return { to: cfg.ROUTER_ADDRESS as Address, calldata, value: undefined, deadline };
    } catch {
      return null;
    }
  }
};

// Register on import so price lookups pick it up by default.
registerDexProvider(AerodromeAdapter as any);

export default AerodromeAdapter;

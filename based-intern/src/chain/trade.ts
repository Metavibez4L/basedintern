import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";
import { readAerodromePool, calculateAerodromeOutput, applySlippage, AERODROME_ROUTER_BASE } from "./aerodrome.js";
import { logger } from "../logger.js";

export type TradeExecutor = {
  executeBuy(spendEth: bigint): Promise<`0x${string}`>;
  executeSell(sellAmount: bigint): Promise<`0x${string}`>;
};

/**
 * Trading with Aerodrome support.
 *
 * This integrates Aerodrome (Base-native DEX) for BUY/SELL operations.
 * ROUTER_TYPE must be "aerodrome" to use this implementation.
 * Requires: POOL_ADDRESS, WETH_ADDRESS, AERODROME_STABLE flag.
 *
 * To enable trading, you must set:
 * - ROUTER_TYPE=aerodrome
 * - POOL_ADDRESS=<your INTERN/WETH pool>
 * - WETH_ADDRESS=<wrapped ETH address on Base>
 * - AERODROME_STABLE=true|false (pool type)
 * - TRADING_ENABLED=true
 * - KILL_SWITCH=false
 * - DRY_RUN=false
 */
export function createTradeExecutor(cfg: AppConfig, clients: ChainClients, token: Address): TradeExecutor {
  if (!clients.walletClient) {
    throw new Error("wallet client not available (WALLET_MODE not supported for trading)");
  }

  if (cfg.ROUTER_TYPE !== "aerodrome") {
    throw new Error(`router type ${cfg.ROUTER_TYPE} not implemented; use ROUTER_TYPE=aerodrome`);
  }

  if (!cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS || !cfg.ROUTER_ADDRESS) {
    throw new Error("Aerodrome trading requires: POOL_ADDRESS, WETH_ADDRESS, ROUTER_ADDRESS");
  }

  const poolAddress = cfg.POOL_ADDRESS as Address;
  const wethAddress = cfg.WETH_ADDRESS as Address;
  const routerAddress = cfg.ROUTER_ADDRESS as Address;
  const wallet = clients.walletClient.account?.address;

  if (!wallet) {
    throw new Error("wallet address not available");
  }

  return {
    async executeBuy(spendEth: bigint): Promise<`0x${string}`> {
      try {
        logger.info("aerodrome_buy_start", { spendEth: spendEth.toString(), pool: poolAddress });

        // Read pool to calculate output
        const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
        if (!pool) {
          throw new Error("failed to read Aerodrome pool");
        }

        // Determine reserve order
        const token0 = pool.token0.toLowerCase();
        const wethLower = wethAddress.toLowerCase();
        const tokenLower = token.toLowerCase();

        let wethReserve: bigint;
        let internReserve: bigint;

        if (token0 === wethLower) {
          wethReserve = pool.reserve0;
          internReserve = pool.reserve1;
        } else if (token0 === tokenLower) {
          internReserve = pool.reserve0;
          wethReserve = pool.reserve1;
        } else {
          throw new Error("pool tokens don't match WETH and INTERN");
        }

        // Calculate expected output
        const expectedOutput = calculateAerodromeOutput(spendEth, wethReserve, internReserve, cfg.AERODROME_STABLE);
        const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

        logger.info("aerodrome_buy_quote", {
          spendEth: spendEth.toString(),
          expectedOutput: expectedOutput.toString(),
          minOutput: minOutput.toString(),
          slippageBps: cfg.SLIPPAGE_BPS
        });

        // TODO: Build actual swap calldata and execute
        // This requires encoding the Aerodrome route struct and calling the router
        // For now, we'll throw with a clear message
        throw new Error(
          "Aerodrome buy swap calldata encoding not yet implemented; " +
          "implement buildAerodromeSwapCalldata() and send transaction via walletClient"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("aerodrome_buy_failed", { error: msg });
        throw err;
      }
    },

    async executeSell(sellAmount: bigint): Promise<`0x${string}`> {
      try {
        logger.info("aerodrome_sell_start", { sellAmount: sellAmount.toString(), pool: poolAddress });

        // Read pool to calculate output
        const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
        if (!pool) {
          throw new Error("failed to read Aerodrome pool");
        }

        // Determine reserve order
        const token0 = pool.token0.toLowerCase();
        const wethLower = wethAddress.toLowerCase();
        const tokenLower = token.toLowerCase();

        let wethReserve: bigint;
        let internReserve: bigint;

        if (token0 === wethLower) {
          wethReserve = pool.reserve0;
          internReserve = pool.reserve1;
        } else if (token0 === tokenLower) {
          internReserve = pool.reserve0;
          wethReserve = pool.reserve1;
        } else {
          throw new Error("pool tokens don't match WETH and INTERN");
        }

        // Calculate expected ETH output
        const expectedOutput = calculateAerodromeOutput(sellAmount, internReserve, wethReserve, cfg.AERODROME_STABLE);
        const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

        logger.info("aerodrome_sell_quote", {
          sellAmount: sellAmount.toString(),
          expectedOutput: expectedOutput.toString(),
          minOutput: minOutput.toString(),
          slippageBps: cfg.SLIPPAGE_BPS
        });

        // TODO: Build actual swap calldata and execute
        // This requires encoding the Aerodrome route struct and calling the router
        // For now, we'll throw with a clear message
        throw new Error(
          "Aerodrome sell swap calldata encoding not yet implemented; " +
          "implement buildAerodromeSwapCalldata() and send transaction via walletClient"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("aerodrome_sell_failed", { error: msg });
        throw err;
      }
    }
  };
}


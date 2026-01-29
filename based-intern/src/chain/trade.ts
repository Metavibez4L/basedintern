import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";

export type TradeExecutor = {
  executeBuy(spendEth: bigint): Promise<`0x${string}`>;
  executeSell(sellAmount: bigint): Promise<`0x${string}`>;
};

/**
 * Trading scaffold.
 *
 * This repo stays fully functional without trading configured:
 * - receipts + posting work in DRY_RUN and when TRADING_ENABLED is false
 *
 * To enable trading, you must set ROUTER_TYPE + ROUTER_ADDRESS (+ other router-specific vars)
 * and implement the router-specific calldata/building logic below.
 */
export function createTradeExecutor(cfg: AppConfig, clients: ChainClients, token: Address): TradeExecutor {
  if (!clients.walletClient) {
    throw new Error("wallet client not available (WALLET_MODE not supported for trading)");
  }
  if (!cfg.ROUTER_ADDRESS || !cfg.ROUTER_TYPE || cfg.ROUTER_TYPE === "unknown") {
    throw new Error("router not configured: set ROUTER_TYPE and ROUTER_ADDRESS");
  }

  // Placeholder until router-specific integration is added.
  // Keep the interface stable so the agent can switch from DRY_RUN to LIVE safely.
  return {
    async executeBuy(_spendEth: bigint) {
      void cfg;
      void clients;
      void token;
      throw new Error("executeBuy not implemented: configure router integration (e.g. Uniswap V3) first");
    },
    async executeSell(_sellAmount: bigint) {
      void cfg;
      void clients;
      void token;
      throw new Error("executeSell not implemented: configure router integration (e.g. Uniswap V3) first");
    }
  };
}


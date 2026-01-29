import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { BrainContext } from "./brain.js";

/**
 * LangChain tools used by the agent brain.
 *
 * Minimal on purpose: we expose a single `get_context` tool so the model can
 * “prove” it is reasoning from the current balances/settings.
 */
export function buildTools(cfg: AppConfig, ctx: BrainContext) {
  const getContext = new DynamicStructuredTool({
    name: "get_context",
    description:
      "Return current wallet context (balances, price best-effort, and safety settings). Call this before proposing an action.",
    schema: z.object({}),
    func: async () => {
      return JSON.stringify(
        {
          wallet: ctx.wallet,
          ethWei: ctx.ethWei.toString(),
          internAmount: ctx.internAmount.toString(),
          internDecimals: ctx.internDecimals,
          price: ctx.priceText ?? "unknown",
          settings: {
            tradingEnabled: cfg.TRADING_ENABLED,
            killSwitch: cfg.KILL_SWITCH,
            dryRun: cfg.DRY_RUN,
            dailyTradeCap: cfg.DAILY_TRADE_CAP,
            minIntervalMinutes: cfg.MIN_INTERVAL_MINUTES,
            maxSpendEthPerTrade: cfg.MAX_SPEND_ETH_PER_TRADE,
            sellFractionBps: cfg.SELL_FRACTION_BPS,
            slippageBps: cfg.SLIPPAGE_BPS
          }
        },
        null,
        2
      );
    }
  });

  return [getContext];
}


import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { BrainContext } from "./brain.js";
import type { NewsItem } from "../news/types.js";

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

  const getNewsContext = new DynamicStructuredTool({
    name: "get_news_context",
    description:
      "Return recent Base ecosystem news items and the news guardrails. Use this to generate a single news tweet that includes a source URL.",
    schema: z.object({}),
    func: async () => {
      // NOTE: populated by the brain; default empty.
      const items: NewsItem[] = (ctx.newsItems as NewsItem[] | undefined) ?? [];
      const nowUtcIso: string = ctx.nowUtcIso ?? new Date().toISOString();
      return JSON.stringify(
        {
          nowUtcIso,
          items,
          guardrails: {
            NEWS_ENABLED: cfg.NEWS_ENABLED,
            NEWS_MODE: cfg.NEWS_MODE,
            NEWS_MAX_POSTS_PER_DAY: cfg.NEWS_MAX_POSTS_PER_DAY,
            NEWS_MIN_INTERVAL_MINUTES: cfg.NEWS_MIN_INTERVAL_MINUTES,
            NEWS_REQUIRE_LINK: cfg.NEWS_REQUIRE_LINK,
            NEWS_REQUIRE_SOURCE_WHITELIST: cfg.NEWS_REQUIRE_SOURCE_WHITELIST,
            NEWS_SOURCES: cfg.NEWS_SOURCES,
            NEWS_DAILY_HOUR_UTC: cfg.NEWS_DAILY_HOUR_UTC,
            NEWS_MAX_ITEMS_CONTEXT: cfg.NEWS_MAX_ITEMS_CONTEXT,
            SOCIAL_MODE: cfg.SOCIAL_MODE
          }
        },
        null,
        2
      );
    }
  });

  return [getContext, getNewsContext];
}


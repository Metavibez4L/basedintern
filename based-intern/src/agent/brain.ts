import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { BASED_INTERN_SYSTEM_PROMPT, BASED_INTERN_NEWS_TWEET_PROMPT } from "./prompt.js";
import type { ProposedAction } from "./decision.js";
import { buildTools } from "./tools.js";
import type { NewsItem } from "../news/types.js";
import { renderDeterministicNewsPost } from "../news/render.js";

export type BrainContext = {
  wallet: Address;
  ethWei: bigint;
  internAmount: bigint;
  internDecimals: number;
  priceText: string | null;
  // Optional: used by the news tweet generator tooling
  newsItems?: Array<{ id: string; source: string; title: string; url: string; publishedAtMs?: number; excerpt?: string }>;
  nowUtcIso?: string;
};

/**
 * Returns an action proposal.
 *
 * - If OPENAI_API_KEY is present, we ask an LLM via LangChain (best-effort).
 * - Otherwise we use a deterministic fallback policy.
 *
 * Guardrails are enforced elsewhere regardless of this output.
 */
export async function proposeAction(cfg: AppConfig, ctx: BrainContext): Promise<ProposedAction> {
  if (cfg.OPENAI_API_KEY) {
    try {
      return await proposeWithLangChain(cfg, ctx);
    } catch (err) {
      logger.warn("LLM propose failed; using fallback policy", {
        error: err instanceof Error ? err.message : String(err)
      });
      return fallbackPolicy(cfg, ctx);
    }
  }
  return fallbackPolicy(cfg, ctx);
}

export type NewsContext = {
  items: NewsItem[];
  chosenItem: NewsItem;
  now: Date;
};

export async function generateNewsTweet(cfg: AppConfig, newsContext: NewsContext): Promise<string> {
  const fallback = deterministicNewsTweet(newsContext.now.getTime(), newsContext.chosenItem);

  if (!cfg.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const tweet = await generateNewsTweetWithLangChain(cfg, newsContext);
    if (isValidNewsTweet(tweet, [newsContext.chosenItem.url], cfg.NEWS_REQUIRE_LINK)) {
      return tweet;
    }
    logger.warn("news tweet failed validation; using deterministic fallback", {
      len: tweet.length,
      requireLink: cfg.NEWS_REQUIRE_LINK
    });
    return fallback;
  } catch (err) {
    logger.warn("news tweet generation failed; using deterministic fallback", {
      error: err instanceof Error ? err.message : String(err)
    });
    return fallback;
  }
}

function deterministicNewsTweet(nowMs: number, item: NewsItem): string {
  return renderDeterministicNewsPost(nowMs, item);
}

function truncateToMaxChars(s: string, max: number): string {
  if (s.length <= max) return s;
  const suffix = "…";
  return s.slice(0, max - suffix.length).trimEnd() + suffix;
}

function isValidNewsTweet(text: string, allowedUrls: string[], requireLink: boolean): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;
  if (t.length > 240) return false;
  if (!requireLink) return true;
  return allowedUrls.some((u) => u && t.includes(u));
}

async function generateNewsTweetWithLangChain(cfg: AppConfig, newsContext: NewsContext): Promise<string> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const { HumanMessage, SystemMessage, ToolMessage } = await import("@langchain/core/messages");

  const baseModel = new ChatOpenAI({
    apiKey: cfg.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    temperature: 0.2
  });

  // Reuse the same tool builder; we pass news items via context.
  const toolCtx: BrainContext = {
    wallet: ("0x" + "0".repeat(40)) as any,
    ethWei: 0n,
    internAmount: 0n,
    internDecimals: 18,
    priceText: null,
    newsItems: newsContext.items,
    nowUtcIso: newsContext.now.toISOString()
  };

  const tools = buildTools(cfg, toolCtx);
  const model = baseModel.bindTools(tools);

  const messages: any[] = [
    new SystemMessage(BASED_INTERN_NEWS_TWEET_PROMPT),
    new HumanMessage([
      "Call `get_news_context` first.",
      "Then write ONE tweet reacting to exactly one item.",
      "Remember: include the chosen item's URL exactly, and keep < 240 characters.",
      "Return ONLY the tweet text."
    ].join("\n"))
  ];

  for (let i = 0; i < 3; i++) {
    const res: any = await model.invoke(messages);
    messages.push(res);

    const toolCalls: Array<any> | undefined =
      res.tool_calls ?? res.additional_kwargs?.tool_calls ?? res.additional_kwargs?.toolCalls;

    if (toolCalls && toolCalls.length) {
      for (const call of toolCalls) {
        const name: string | undefined = call.name ?? call.function?.name;
        const id: string | undefined = call.id ?? call.tool_call_id;
        const argsRaw = call.args ?? call.function?.arguments ?? {};

        const tool = tools.find((t: any) => t.name === name);
        if (!tool || !id) continue;

        const args = typeof argsRaw === "string" ? safeParseArgs(argsRaw) : argsRaw;
        const out = await tool.invoke(args ?? {});
        messages.push(new ToolMessage({ tool_call_id: id, content: String(out) }));
      }
      continue;
    }

    const text = typeof res.content === "string" ? res.content : String(res.content ?? "");
    return text.trim();
  }

  throw new Error("LLM did not produce a final tweet after tool calls");
}

function fallbackPolicy(cfg: AppConfig, ctx: BrainContext): ProposedAction {
  // Deterministic and conservative. This runs even without OPENAI_API_KEY.
  // It can propose BUY/SELL only when operator has explicitly opted into LIVE trading.
  if (!cfg.TRADING_ENABLED || cfg.KILL_SWITCH || cfg.DRY_RUN) {
    return { action: "HOLD", rationale: "Safety mode active (or trading disabled). Holding." };
  }

  // Tier 1: No INTERN at all → BUY (establish position)
  if (ctx.internAmount === 0n) {
    return { action: "BUY", rationale: "No INTERN balance. Proposing a tiny buy to establish position (guardrails will cap)." };
  }

  // Tier 2: Very low ETH balance → SELL to rebalance
  const lowEthThreshold = 100_000n; // 0.001 ETH
  if (ctx.ethWei < lowEthThreshold) {
    return { 
      action: "SELL", 
      rationale: "Low ETH balance detected. Proposing a small sell to rebalance (guardrails will cap)." 
    };
  }

  // Tier 3: Decent balances → Use price signal if available
  if (ctx.priceText && ctx.priceText !== "unknown") {
    // Try to parse price; if price is low, buy; if high, hold.
    const match = ctx.priceText.match(/[\d.]+/);
    if (match) {
      const price = parseFloat(match[0]);
      if (!isNaN(price)) {
        if (price < 0.50) {
          return { action: "BUY", rationale: `Price low ($${price.toFixed(4)}). Proposing a small buy.` };
        } else if (price > 2.0) {
          return { action: "SELL", rationale: `Price high ($${price.toFixed(4)}). Proposing a small sell.` };
        }
      }
    }
  }

  // Tier 4: Default → probabilistic (40% buy, 25% sell, 35% hold)
  // Buy-biased to create gentle upward price pressure in thin pool.
  // Uses current hour + wallet chars + token balance length so the outcome
  // varies across ticks instead of being frozen on the same result every time.
  const hourSeed = new Date().getUTCHours();
  const minuteBucket = Math.floor(new Date().getUTCMinutes() / 10); // 0-5
  const hash =
    ctx.wallet.charCodeAt(2) +
    ctx.wallet.charCodeAt(4) +
    ctx.internAmount.toString().length +
    hourSeed * 7 +
    minuteBucket * 13;
  const rand = hash % 100;
  if (rand < 40) {
    return { action: "BUY", rationale: "Probabilistic buy (no strong signal detected)." };
  } else if (rand < 65) {
    return { action: "SELL", rationale: "Probabilistic sell (no strong signal detected)." };
  }
  return { action: "HOLD", rationale: "No signal detected. Probabilistic hold." };
}

async function proposeWithLangChain(cfg: AppConfig, ctx: BrainContext): Promise<ProposedAction> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const { HumanMessage, SystemMessage, ToolMessage } = await import("@langchain/core/messages");

  const baseModel = new ChatOpenAI({
    apiKey: cfg.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    temperature: 0.2
  });

  const tools = buildTools(cfg, ctx);
  const model = baseModel.bindTools(tools);

  const messages: any[] = [
    new SystemMessage(BASED_INTERN_SYSTEM_PROMPT),
    new HumanMessage(
      [
        "Call `get_context` first.",
        "Then respond with ONLY valid JSON:",
        '{ "action": "BUY"|"SELL"|"HOLD", "rationale": "..." }'
      ].join("\n")
    )
  ];

  // Simple tool-calling loop (no external agent executor needed).
  for (let i = 0; i < 3; i++) {
    const res: any = await model.invoke(messages);
    messages.push(res);

    const toolCalls: Array<any> | undefined =
      res.tool_calls ?? res.additional_kwargs?.tool_calls ?? res.additional_kwargs?.toolCalls;

    if (toolCalls && toolCalls.length) {
      for (const call of toolCalls) {
        const name: string | undefined = call.name ?? call.function?.name;
        const id: string | undefined = call.id ?? call.tool_call_id;
        const argsRaw = call.args ?? call.function?.arguments ?? {};

        const tool = tools.find((t: any) => t.name === name);
        if (!tool || !id) continue;

        const args = typeof argsRaw === "string" ? safeParseArgs(argsRaw) : argsRaw;
        const out = await tool.invoke(args ?? {});
        messages.push(new ToolMessage({ tool_call_id: id, content: String(out) }));
      }
      continue;
    }

    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = safeParseJsonObject(text);

    const action = parsed?.action;
    const rationale = parsed?.rationale;

    if (action === "BUY" || action === "SELL" || action === "HOLD") {
      return { action, rationale: typeof rationale === "string" && rationale.trim() ? rationale : "LLM proposal." };
    }

    throw new Error("LLM output missing valid {action,rationale} JSON");
  }

  throw new Error("LLM did not produce a final answer after tool calls");
}

function safeParseJsonObject(text: string): any | null {
  // Try exact JSON first.
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj;
  } catch {
    // ignore
  }
  // Try to extract a JSON object substring.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (obj && typeof obj === "object") return obj;
    } catch {
      // ignore
    }
  }
  return null;
}

function safeParseArgs(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}


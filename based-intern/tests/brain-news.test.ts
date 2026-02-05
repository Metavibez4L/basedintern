import { describe, it, expect, vi } from "vitest";
import { generateNewsTweet } from "../src/agent/brain.js";
import type { AppConfig } from "../src/config.js";

vi.mock("@langchain/openai", () => {
  class ChatOpenAI {
    constructor(_: any) {}
    bindTools(_tools: any[]) {
      return {
        invoke: async () => {
          return { content: "based intern memo: no link here" };
        }
      };
    }
  }
  return { ChatOpenAI };
});

vi.mock("@langchain/core/messages", () => {
  class SystemMessage {
    content: any;
    constructor(content: any) {
      this.content = content;
    }
  }
  class HumanMessage {
    content: any;
    constructor(content: any) {
      this.content = content;
    }
  }
  class ToolMessage {
    tool_call_id: string;
    content: any;
    constructor(args: { tool_call_id: string; content: any }) {
      this.tool_call_id = args.tool_call_id;
      this.content = args.content;
    }
  }
  return { SystemMessage, HumanMessage, ToolMessage };
});

function mockCfg(overrides?: Partial<AppConfig>): AppConfig {
  const base: AppConfig = {
    WALLET_MODE: "private_key",
    PRIVATE_KEY: "0x" + "1".repeat(64),
    STATE_PATH: "data/state.json",
    BASE_SEPOLIA_RPC_URL: "http://localhost:8545",
    BASE_RPC_URL: "http://localhost:8545",
    CHAIN: "base-sepolia",
    RPC_URL: undefined,
    TOKEN_ADDRESS: undefined,

    ERC8004_ENABLED: false,

    LOOP_MINUTES: 30,
    DRY_RUN: true,
    TRADING_ENABLED: false,
    KILL_SWITCH: true,

    CONTROL_ENABLED: false,
    CONTROL_BIND: "0.0.0.0",
    CONTROL_PORT: 8080,
    CONTROL_TOKEN: undefined,

    DAILY_TRADE_CAP: 2,
    MIN_INTERVAL_MINUTES: 60,
    MAX_SPEND_ETH_PER_TRADE: "0.0005",
    SELL_FRACTION_BPS: 500,
    SLIPPAGE_BPS: 300,

    APPROVE_MAX: false,
    APPROVE_CONFIRMATIONS: 1,

    WETH_ADDRESS: undefined,
    ROUTER_TYPE: "unknown",
    ROUTER_ADDRESS: undefined,
    POOL_ADDRESS: undefined,

    AERODROME_STABLE: false,
    AERODROME_GAUGE_ADDRESS: undefined,

    SOCIAL_MODE: "none",
    SOCIAL_MULTI_TARGETS: "x_api,moltbook",
    X_API_KEY: undefined,
    X_API_SECRET: undefined,
    X_ACCESS_TOKEN: undefined,
    X_ACCESS_SECRET: undefined,

    X_PHASE1_MENTIONS: false,
    X_POLL_MINUTES: 2,

    MOLTBOOK_ENABLED: false,
    MOLTBOOK_BASE_URL: "https://www.moltbook.com/api/v1",
    MOLTBOOK_AUTH_MODE: "bearer",
    MOLTBOOK_API_KEY: undefined,
    MOLTBOOK_COOKIE_PATH: "data/moltbook/cookies.json",
    MOLTBOOK_SESSION_PATH: "data/moltbook/session.json",
    MOLTBOOK_USER_AGENT: "BasedIntern/1.0",

    OPENAI_API_KEY: undefined,

    NEWS_ENABLED: true,
    NEWS_MODE: "event",
    NEWS_MAX_POSTS_PER_DAY: 2,
    NEWS_MIN_INTERVAL_MINUTES: 120,
    NEWS_MIN_SCORE: 0.5,
    NEWS_FEEDS: "",
    NEWS_GITHUB_FEEDS: "",
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: true,
    NEWS_SOURCES: "base_blog,base_dev_blog,cdp_launches",
    NEWS_POSTS_PER_DAY: undefined,
    NEWS_INTERVAL_MINUTES: undefined,
    NEWS_DAILY_HOUR_UTC: 15,
    NEWS_MAX_ITEMS_CONTEXT: 8,
    NEWS_FETCH_INTERVAL_MINUTES: 60,
    NEWS_MIN_RELEVANCE_SCORE: 0.5,
    NEWS_CRYPTO_PANIC_KEY: undefined,
    NEWS_RSS_FEEDS: []
,
    MOLTBOOK_REPLY_TO_COMMENTS: false,
    MOLTBOOK_REPLY_INTERVAL_MINUTES: 30
  };
  return { ...base, ...overrides };
}

describe("generateNewsTweet", () => {
  it("deterministic fallback includes URL and is <= 240 chars", async () => {
    const cfg = mockCfg({ OPENAI_API_KEY: undefined });
    const chosenItem = {
      id: "x",
      fingerprint: "x",
      source: "base_blog" as const,
      title: "Base posted something interesting",
      url: "https://blog.base.org/posts/hello"
    };

    const tweet = await generateNewsTweet(cfg, {
      items: [chosenItem],
      chosenItem,
      now: new Date("2026-01-30T12:00:00Z")
    });

    expect(tweet.length).toBeLessThanOrEqual(240);
    expect(tweet).toContain(chosenItem.url);
  });

  it("LLM output missing required link falls back deterministically", async () => {
    const cfg = mockCfg({ OPENAI_API_KEY: "fake" });
    const chosenItem = {
      id: "x",
      fingerprint: "x",
      source: "base_blog" as const,
      title: "Some Base news",
      url: "https://blog.base.org/posts/hello"
    };

    const tweet = await generateNewsTweet(cfg, {
      items: [chosenItem],
      chosenItem,
      now: new Date("2026-01-30T12:00:00Z")
    });

    expect(tweet).toContain(chosenItem.url);
    expect(tweet.length).toBeLessThanOrEqual(240);
  });
});


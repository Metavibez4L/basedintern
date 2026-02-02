import { describe, it, expect, vi, afterEach } from "vitest";
import { buildNewsPlan } from "../src/news/news.js";
import { generateNewsTweet } from "../src/agent/brain.js";
import type { AgentState } from "../src/agent/state.js";
import type { AppConfig } from "../src/config.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
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
    HEADLESS: true,
    X_USERNAME: undefined,
    X_PASSWORD: undefined,
    X_COOKIES_PATH: undefined,
    X_COOKIES_B64: undefined,
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
    NEWS_MIN_INTERVAL_MINUTES: 60,
    NEWS_POSTS_PER_DAY: undefined,
    NEWS_INTERVAL_MINUTES: undefined,
    NEWS_MIN_SCORE: 0,
    NEWS_FEEDS: "https://example.com/feed.xml",
    NEWS_GITHUB_FEEDS: "",
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: false,
    NEWS_SOURCES: "rss",
    NEWS_DAILY_HOUR_UTC: 15,
    NEWS_MAX_ITEMS_CONTEXT: 8,
    NEWS_FETCH_INTERVAL_MINUTES: 60,
    NEWS_MIN_RELEVANCE_SCORE: 0.5,
    NEWS_CRYPTO_PANIC_KEY: undefined,
    NEWS_RSS_FEEDS: [],
    MOLTBOOK_REPLY_TO_COMMENTS: false,
    MOLTBOOK_REPLY_INTERVAL_MINUTES: 30
  };
  return { ...base, ...overrides } as any;
}

function mockState(overrides?: Partial<AgentState>): AgentState {
  const base: AgentState = {
    lastExecutedTradeAtMs: null,
    dayKey: "2026-01-30",
    tradesExecutedToday: 0,

    newsLastPostMs: null,
    newsDailyCount: 0,
    newsLastPostDayUtc: null,
    seenNewsFingerprints: [],
    lastPostedNewsFingerprint: null,

    xApiFailureCount: 0,
    xApiCircuitBreakerDisabledUntilMs: null,
    lastPostedReceiptFingerprint: null,

    lastSeenNonce: null,
    lastSeenEthWei: null,
    lastSeenTokenRaw: null,
    lastSeenBlockNumber: null,

    lastPostDayUtc: null,
    lastSeenMentionId: undefined,
    repliedMentionFingerprints: undefined,
    lastSuccessfulMentionPollMs: undefined,

    moltbookLastPostMs: null,
    lastPostedMoltbookReceiptFingerprint: null,
    moltbookFailureCount: 0,
    moltbookCircuitBreakerDisabledUntilMs: null
  };
  return { ...base, ...overrides };
}

describe("news pipeline selection", () => {
  it("buildNewsPlan picks top unseen item and deterministic tweet includes URL", async () => {
    const cfg = mockCfg({ OPENAI_API_KEY: undefined });
    const now = new Date("2026-01-30T12:00:00Z");

    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Base shipped something</title>
      <link>https://example.com/a</link>
      <pubDate>Thu, 30 Jan 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
        headers: new Headers()
      } as any;
    }) as any;

    const { plan, items } = await buildNewsPlan({ cfg, state: mockState(), now });
    expect(plan.shouldPost).toBe(true);
    expect(plan.item).toBeTruthy();

    const tweet = await generateNewsTweet(cfg, { items, chosenItem: plan.item!, now });
    expect(tweet.length).toBeLessThanOrEqual(240);
    expect(tweet).toContain(plan.item!.url);
  });

  it("respects min interval via shouldPostNewsNow", async () => {
    const cfg = mockCfg({ NEWS_MIN_INTERVAL_MINUTES: 120 });
    const now = new Date("2026-01-30T12:00:00Z");

    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Base shipped something</title>
      <link>https://example.com/a</link>
      <pubDate>Thu, 30 Jan 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
        headers: new Headers()
      } as any;
    }) as any;

    const state = mockState({ newsLastPostMs: now.getTime() - 30 * 60 * 1000, newsLastPostDayUtc: "2026-01-30" });
    const { plan } = await buildNewsPlan({ cfg, state, now });
    expect(plan.shouldPost).toBe(false);
  });
});


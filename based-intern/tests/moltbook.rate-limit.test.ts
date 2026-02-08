import { describe, it, expect, vi, afterEach } from "vitest";
import type { AppConfig } from "../src/config.js";
import type { AgentState } from "../src/agent/state.js";
import { postMoltbookReceipt } from "../src/social/moltbook/index.js";

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
    MIN_INTERVAL_MINUTES: 0,
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

    SOCIAL_MODE: "moltbook",
    SOCIAL_MULTI_TARGETS: "moltbook",
    X_API_KEY: undefined,
    X_API_SECRET: undefined,
    X_ACCESS_TOKEN: undefined,
    X_ACCESS_SECRET: undefined,

    X_PHASE1_MENTIONS: false,
    X_POLL_MINUTES: 2,

    MOLTBOOK_ENABLED: true,
    MOLTBOOK_BASE_URL: "https://www.moltbook.com/api/v1",
    MOLTBOOK_AUTH_MODE: "bearer",
    MOLTBOOK_API_KEY: "test-key",
    MOLTBOOK_COOKIE_PATH: "data/moltbook/cookies.json",
    MOLTBOOK_SESSION_PATH: "data/moltbook/session.json",
    MOLTBOOK_USER_AGENT: "BasedIntern/1.0",

    OPENAI_API_KEY: undefined,

    NEWS_ENABLED: false,
    NEWS_MODE: "event",
    NEWS_MAX_POSTS_PER_DAY: 2,
    NEWS_MIN_INTERVAL_MINUTES: 120,
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: true,
    NEWS_SOURCES: "",
    NEWS_FEEDS: "",
    NEWS_GITHUB_FEEDS: "",
    NEWS_MIN_SCORE: 0.5,
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
    MOLTBOOK_REPLY_INTERVAL_MINUTES: 30,
    NEWS_SOURCE_COOLDOWN_HOURS: 4,
  };
  return { ...base, ...overrides };
}

function mockState(overrides?: Partial<AgentState>): AgentState {
  const base: AgentState = {
    lastExecutedTradeAtMs: null,
    dayKey: "2026-02-01",
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

describe("moltbook rate limit handling", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sets circuit breaker until retry-after on 429 (no long sleep)", async () => {
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ retry_after_minutes: 11 })
      } as any;
    }) as any;

    let savedState: AgentState | null = null;
    const saveStateFn = async (s: AgentState) => {
      savedState = s;
    };

    const cfg = mockCfg();
    const state = mockState();

    const now = Date.now();
    const out = await postMoltbookReceipt(cfg, state, saveStateFn, "hello world");

    expect(out.posted).toBe(false);
    expect(out.reason).toBe("rate_limited");
    expect(savedState).not.toBeNull();

    const until = (savedState as any).moltbookCircuitBreakerDisabledUntilMs as number;
    expect(typeof until).toBe("number");
    expect(until).toBeGreaterThan(now);

    // Should not count rate limits as failures.
    expect((savedState as any).moltbookFailureCount).toBe(0);
  });
});


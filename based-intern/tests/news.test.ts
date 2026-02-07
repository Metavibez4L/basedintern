import { describe, it, expect, vi, afterEach } from "vitest";
import { canonicalizeUrl, fingerprintNewsItem } from "../src/news/fingerprint.js";
import { shouldPostNewsNow, filterUnseenNewsItems } from "../src/news/news.js";
import { addSeenNewsFingerprint } from "../src/agent/state.js";
import type { AgentState } from "../src/agent/state.js";
import type { AppConfig } from "../src/config.js";

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
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: true,
    NEWS_SOURCES: "",
    NEWS_FEEDS: undefined,
    NEWS_GITHUB_FEEDS: undefined,
    NEWS_MIN_SCORE: 0.5,
    NEWS_POSTS_PER_DAY: undefined,
    NEWS_INTERVAL_MINUTES: undefined,
    NEWS_DAILY_HOUR_UTC: 15,
    NEWS_MAX_ITEMS_CONTEXT: 8,
    NEWS_FETCH_INTERVAL_MINUTES: 60,
    NEWS_MIN_RELEVANCE_SCORE: 0.5,
    NEWS_CRYPTO_PANIC_KEY: undefined,
    NEWS_RSS_FEEDS: [],
    MOLTBOOK_REPLY_TO_COMMENTS: false,
    MOLTBOOK_REPLY_INTERVAL_MINUTES: 30
  };
  return { ...base, ...overrides };
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

describe("fingerprinting + canonicalization", () => {
  it("canonicalizeUrl strips utm params and hash", () => {
    const u = canonicalizeUrl("https://example.com/posts/x?utm_source=aa&utm_medium=bb#section");
    expect(u).toBe("https://example.com/posts/x");
  });

  it("fingerprintNewsItem is stable across tracking params", () => {
    const fp1 = fingerprintNewsItem({ source: "x_timeline", title: "Hello   World", url: "https://example.com/posts/x?utm_source=aa" });
    const fp2 = fingerprintNewsItem({ source: "x_timeline", title: "hello world", url: "https://example.com/posts/x" });
    expect(fp1).toBe(fp2);
  });
});

describe("dedupe + posting logic", () => {
  it("maintains an LRU of last 50 seen fingerprints", () => {
    let state = mockState({ seenNewsFingerprints: [] });
    for (let i = 0; i < 60; i++) {
      state = addSeenNewsFingerprint(state, `fp-${i}`, 50);
    }
    expect(state.seenNewsFingerprints.length).toBe(50);
    expect(state.seenNewsFingerprints[0]).toBe("fp-10");
    expect(state.seenNewsFingerprints[49]).toBe("fp-59");

    // re-add existing should move it to the newest position
    state = addSeenNewsFingerprint(state, "fp-20", 50);
    expect(state.seenNewsFingerprints.length).toBe(50);
    expect(state.seenNewsFingerprints[49]).toBe("fp-20");
  });

  it("filters unseen items by fingerprint id", () => {
    const itemA = { id: "a", fingerprint: "a", source: "x_timeline" as const, title: "A", url: "https://x.com/base/status/1" };
    const itemB = { id: "b", fingerprint: "b", source: "x_timeline" as const, title: "B", url: "https://x.com/base/status/2" };

    const state = mockState({ seenNewsFingerprints: ["a"] });
    const unseen = filterUnseenNewsItems(state, [itemA, itemB]);
    expect(unseen.map((x) => x.id)).toEqual(["b"]);
  });

  it("event mode posts only when there is an unseen item", () => {
    const cfg = mockCfg({ NEWS_MODE: "event", NEWS_ENABLED: true });
    const now = new Date("2026-01-30T12:00:00Z");

    const state = mockState({ newsDailyCount: 0, newsLastPostMs: null });
    const item = { id: "x", fingerprint: "x", source: "x_timeline" as const, title: "X", url: "https://x.com/base/status/1" };

    const plan = shouldPostNewsNow({ cfg, state, now, unseenItems: [item] });
    expect(plan.shouldPost).toBe(true);
    expect(plan.item?.id).toBe("x");
  });

  it("daily mode posts only at configured UTC hour", () => {
    const cfg = mockCfg({ NEWS_MODE: "daily", NEWS_DAILY_HOUR_UTC: 15, NEWS_ENABLED: true });
    const item = { id: "x", fingerprint: "x", source: "x_timeline" as const, title: "X", url: "https://x.com/base/status/1" };

    const state = mockState({ newsDailyCount: 0, newsLastPostDayUtc: null });

    const no = shouldPostNewsNow({ cfg, state, now: new Date("2026-01-30T14:00:00Z"), unseenItems: [item] });
    expect(no.shouldPost).toBe(false);

    const yes = shouldPostNewsNow({ cfg, state, now: new Date("2026-01-30T15:00:00Z"), unseenItems: [item] });
    expect(yes.shouldPost).toBe(true);
  });

  it("respects min interval and daily cap", () => {
    const cfg = mockCfg({ NEWS_ENABLED: true, NEWS_MIN_INTERVAL_MINUTES: 120, NEWS_MAX_POSTS_PER_DAY: 2 });
    const now = new Date("2026-01-30T12:00:00Z");
    const item = { id: "x", fingerprint: "x", source: "x_timeline" as const, title: "X", url: "https://x.com/base/status/1" };

    const tooSoon = shouldPostNewsNow({
      cfg,
      state: mockState({ newsLastPostMs: now.getTime() - 30 * 60 * 1000, newsDailyCount: 0, newsLastPostDayUtc: "2026-01-30" }),
      now,
      unseenItems: [item]
    });
    expect(tooSoon.shouldPost).toBe(false);

    const capped = shouldPostNewsNow({
      cfg,
      state: mockState({ newsDailyCount: 2, newsLastPostDayUtc: "2026-01-30" }),
      now,
      unseenItems: [item]
    });
    expect(capped.shouldPost).toBe(false);
  });

  it("resets daily count at UTC midnight", () => {
    const cfg = mockCfg({ NEWS_ENABLED: true, NEWS_MAX_POSTS_PER_DAY: 2 });
    const now = new Date("2026-01-31T00:01:00Z");
    const item = { id: "x", fingerprint: "x", source: "x_timeline" as const, title: "X", url: "https://x.com/base/status/1" };

    const state = mockState({ newsDailyCount: 2, newsLastPostDayUtc: "2026-01-30" });
    const plan = shouldPostNewsNow({ cfg, state, now, unseenItems: [item] });
    expect(plan.shouldPost).toBe(true);
  });
});

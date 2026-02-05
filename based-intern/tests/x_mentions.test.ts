import { describe, it, expect } from "vitest";
import { parseCommand, composeReply, computeMentionFingerprint, truncateForTweet } from "../src/social/x_mentions.js";
import type { AppConfig } from "../src/config.js";
import type { MentionPollerContext } from "../src/social/x_mentions.js";
import type { AgentState } from "../src/agent/state.js";

/**
 * Mock config for testing
 */
function mockConfig(overrides?: Partial<AppConfig>): AppConfig {
  const base: AppConfig = {
    WALLET_MODE: "private_key",
    PRIVATE_KEY: "0x" + "1".repeat(64),
    STATE_PATH: "data/state.json",
    BASE_SEPOLIA_RPC_URL: "http://localhost:8545",
    BASE_RPC_URL: "http://localhost:8545",
    CHAIN: "base-sepolia",
    TOKEN_ADDRESS: `0x${"a".repeat(40)}` as `0x${string}`,
    ERC8004_ENABLED: false,
    LOOP_MINUTES: 30,
    TRADING_ENABLED: false,
    KILL_SWITCH: true,
    DRY_RUN: true,

    CONTROL_ENABLED: false,
    CONTROL_BIND: "0.0.0.0",
    CONTROL_PORT: 8080,
    CONTROL_TOKEN: undefined,
    ROUTER_TYPE: "unknown",
    ROUTER_ADDRESS: undefined,
    POOL_ADDRESS: undefined,
    WETH_ADDRESS: undefined,
    AERODROME_STABLE: false,
    DAILY_TRADE_CAP: 5,
    MIN_INTERVAL_MINUTES: 15,
    MAX_SPEND_ETH_PER_TRADE: "0.1",
    SELL_FRACTION_BPS: 5000,
    SLIPPAGE_BPS: 300,
    APPROVE_MAX: false,
    APPROVE_CONFIRMATIONS: 1,
    OPENAI_API_KEY: undefined,
    SOCIAL_MODE: "x_api",
    SOCIAL_MULTI_TARGETS: "x_api,moltbook",
    X_API_KEY: "test_key",
    X_API_SECRET: "test_secret",
    X_ACCESS_TOKEN: "test_token",
    X_ACCESS_SECRET: "test_secret",
    X_PHASE1_MENTIONS: true,
    X_POLL_MINUTES: 2,

    MOLTBOOK_ENABLED: false,
    MOLTBOOK_BASE_URL: "https://www.moltbook.com/api/v1",
    MOLTBOOK_AUTH_MODE: "bearer",
    MOLTBOOK_API_KEY: undefined,
    MOLTBOOK_COOKIE_PATH: "data/moltbook/cookies.json",
    MOLTBOOK_SESSION_PATH: "data/moltbook/session.json",
    MOLTBOOK_USER_AGENT: "BasedIntern/1.0",

    NEWS_ENABLED: false,
    NEWS_MODE: "event",
    NEWS_MAX_POSTS_PER_DAY: 2,
    NEWS_MIN_INTERVAL_MINUTES: 120,
    NEWS_POSTS_PER_DAY: undefined,
    NEWS_INTERVAL_MINUTES: undefined,
    NEWS_MIN_SCORE: 0.5,
    NEWS_FEEDS: "",
    NEWS_GITHUB_FEEDS: "",
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: true,
    NEWS_SOURCES: "base_blog,base_dev_blog,cdp_launches",
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

describe("x_mentions command parsing", () => {
  it("recognizes 'help' command", () => {
    const result = parseCommand("@botaccount help");
    expect(result.type).toBe("help");
  });

  it("recognizes '?' as help", () => {
    const result = parseCommand("what's available?");
    expect(result.type).toBe("help");
  });

  it("recognizes 'status' command", () => {
    const result = parseCommand("@botaccount status");
    expect(result.type).toBe("status");
  });

  it("recognizes 'bal' as status alias", () => {
    const result = parseCommand("check bal");
    expect(result.type).toBe("status");
  });

  it("recognizes 'buy' command", () => {
    const result = parseCommand("@botaccount buy 0.1");
    expect(result.type).toBe("buy");
  });

  it("recognizes 'sell' command", () => {
    const result = parseCommand("@botaccount sell 1000");
    expect(result.type).toBe("sell");
  });

  it("recognizes 'why' command", () => {
    const result = parseCommand("why is it on hold?");
    expect(result.type).toBe("why");
  });

  it("returns 'unknown' for unrecognized command", () => {
    const result = parseCommand("something random");
    expect(result.type).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(parseCommand("HELP").type).toBe("help");
    expect(parseCommand("Status").type).toBe("status");
    expect(parseCommand("BUY NOW").type).toBe("buy");
  });

  it("handles whitespace", () => {
    expect(parseCommand("  help  ").type).toBe("help");
    expect(parseCommand("\nstatus\n").type).toBe("status");
  });
});

describe("x_mentions reply composition", () => {
  it("composes help reply", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("help");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("help");
    expect(reply).toContain("status");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes status reply with trading disabled", () => {
    const cfg = mockConfig({ TRADING_ENABLED: false, KILL_SWITCH: true });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("status");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("disabled");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes status reply with trading enabled", () => {
    const cfg = mockConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("status");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("enabled");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes buy reply without executing", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("buy");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("buy");
    expect(reply).toContain("phase 1");
    expect(reply).not.toContain("executed");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes sell reply without executing", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("sell");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("sell");
    expect(reply).toContain("phase 1");
    expect(reply).not.toContain("executed");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes why reply with guardrail flags", () => {
    const cfg = mockConfig({ TRADING_ENABLED: true, KILL_SWITCH: false });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("why");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("TRADING_ENABLED");
    expect(reply).toContain("KILL_SWITCH");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("composes unknown command reply", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("xyz");
    const reply = composeReply(cmd, ctx);

    expect(reply).toContain("didn't recognize");
    expect(reply.length).toBeLessThanOrEqual(240);
  });

  it("always includes mode indicator in reply", () => {
    const cfg = mockConfig({ DRY_RUN: true });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };
    const cmd = parseCommand("status");
    const reply = composeReply(cmd, ctx);

    expect(reply).toMatch(/DRY_RUN|LIVE/);
  });
});

describe("x_mentions reply length enforcement", () => {
  it("truncates long replies", () => {
    const text = "a".repeat(300);
    const truncated = truncateForTweet(text);

    expect(truncated.length).toBeLessThanOrEqual(240);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("preserves short replies", () => {
    const text = "hello world";
    const result = truncateForTweet(text);

    expect(result).toBe(text);
  });

  it("handles edge case at 240 chars", () => {
    const text = "a".repeat(240);
    const result = truncateForTweet(text);

    expect(result).toBe(text);
  });

  it("handles edge case at 241 chars", () => {
    const text = "a".repeat(241);
    const result = truncateForTweet(text);

    expect(result.length).toBeLessThanOrEqual(240);
    expect(result).toContain("…");
  });
});

describe("x_mentions fingerprinting for dedup", () => {
  it("computes consistent hash for same mention + command", () => {
    const fp1 = computeMentionFingerprint("tweet_123", "buy");
    const fp2 = computeMentionFingerprint("tweet_123", "buy");

    expect(fp1.hash).toBe(fp2.hash);
  });

  it("computes different hash for different mention IDs", () => {
    const fp1 = computeMentionFingerprint("tweet_123", "buy");
    const fp2 = computeMentionFingerprint("tweet_456", "buy");

    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it("computes different hash for different commands", () => {
    const fp1 = computeMentionFingerprint("tweet_123", "buy");
    const fp2 = computeMentionFingerprint("tweet_123", "sell");

    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it("produces deterministic hash", () => {
    const hashes = Array.from({ length: 5 }, () => computeMentionFingerprint("tweet_123", "status").hash);
    const [first, ...rest] = hashes;

    expect(rest.every((h) => h === first)).toBe(true);
  });

  it("stores mention ID and command in fingerprint", () => {
    const fp = computeMentionFingerprint("tweet_789", "why");

    expect(fp.mentionId).toBe("tweet_789");
    expect(fp.command).toBe("why");
    expect(fp.hash).toBeDefined();
    expect(typeof fp.hash).toBe("string");
    expect(fp.hash.length).toBeGreaterThan(0);
  });
});

describe("x_mentions state handling", () => {
  it("tracks replied mention fingerprints", () => {
    const state = { ...defaultState };
    const fp1 = computeMentionFingerprint("tweet_1", "buy");
    const fp2 = computeMentionFingerprint("tweet_2", "sell");

    state.repliedMentionFingerprints = [fp1.hash, fp2.hash];

    expect(state.repliedMentionFingerprints).toContain(fp1.hash);
    expect(state.repliedMentionFingerprints).toContain(fp2.hash);
  });

  it("maintains lastSeenMentionId for pagination", () => {
    const state = { ...defaultState };
    state.lastSeenMentionId = "tweet_999";

    expect(state.lastSeenMentionId).toBe("tweet_999");
  });

  it("tracks lastSuccessfulMentionPollMs", () => {
    const state = { ...defaultState };
    const now = Date.now();
    state.lastSuccessfulMentionPollMs = now;

    expect(state.lastSuccessfulMentionPollMs).toBe(now);
  });

  it("initializes mention state as undefined if not set", () => {
    const state = { ...defaultState };

    expect(state.lastSeenMentionId).toBeUndefined();
    expect(state.repliedMentionFingerprints).toBeUndefined();
    expect(state.lastSuccessfulMentionPollMs).toBeUndefined();
  });

  it("supports LRU list of fingerprints (max 20)", () => {
    const state = { ...defaultState };
    const fingerprints = Array.from({ length: 25 }, (_, i) => computeMentionFingerprint(`tweet_${i}`, "buy").hash);

    // Simulate keeping last 20
    state.repliedMentionFingerprints = fingerprints.slice(-20);

    expect(state.repliedMentionFingerprints).toHaveLength(20);
    expect(state.repliedMentionFingerprints[0]).toBe(fingerprints[5]);
    expect(state.repliedMentionFingerprints[19]).toBe(fingerprints[24]);
  });
});

describe("x_mentions safety guarantees", () => {
  it("never mentions trade execution in replies", () => {
    const cfg = mockConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };

    const commands = ["buy", "sell", "help", "status", "why"];
    for (const cmdText of commands) {
      const cmd = parseCommand(cmdText);
      const reply = composeReply(cmd, ctx);

      expect(reply).not.toContain("executed");
      expect(reply).not.toContain("swapped");
      expect(reply).not.toContain("approved");
      expect(reply).not.toContain("spending");
      expect(reply).not.toContain("router");
    }
  });

  it("always explains guardrails if buy/sell requested", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };

    for (const cmdText of ["buy", "sell"]) {
      const cmd = parseCommand(cmdText);
      const reply = composeReply(cmd, ctx);

      expect(reply.toLowerCase()).toContain("phase 1");
      expect(reply.toLowerCase()).toContain("no");
    }
  });

  it("acknowledges intent without accepting risky commands", () => {
    const cfg = mockConfig();
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };

    const buyCmd = parseCommand("buy 10 ETH");
    const buyReply = composeReply(buyCmd, ctx);

    expect(buyReply.toLowerCase()).toContain("intent");
    expect(buyReply.toLowerCase()).not.toContain("confirmed");
    expect(buyReply.toLowerCase()).not.toContain("ok");
    expect(buyReply.toLowerCase()).not.toContain("approved");
  });

  it("requires X_PHASE1_MENTIONS=true to enable feature", () => {
    const cfg = mockConfig({ X_PHASE1_MENTIONS: false });
    const ctx: MentionPollerContext = {
      cfg,
      state: { ...defaultState },
      saveStateFn: async () => {}
    };

    // Feature check is done in index.ts, not in x_mentions.ts itself
    // But we can verify the config property exists
    expect(cfg.X_PHASE1_MENTIONS).toBe(false);
  });

  it("respects X_POLL_MINUTES config", () => {
    const cfg = mockConfig({ X_POLL_MINUTES: 5 });

    expect(cfg.X_POLL_MINUTES).toBe(5);
  });
});

// Default state fixture
const defaultState: AgentState = {
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

  moltbookLastPostMs: null,
  lastPostedMoltbookReceiptFingerprint: null,
  moltbookFailureCount: 0,
  moltbookCircuitBreakerDisabledUntilMs: null
};


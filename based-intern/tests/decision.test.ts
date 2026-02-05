import { describe, it, expect } from "vitest";
import { enforceGuardrails, type ProposedAction, type DecisionContext } from "../src/agent/decision.js";
import type { AppConfig } from "../src/config.js";
import type { AgentState } from "../src/agent/state.js";

/**
 * Create a minimal mock AppConfig for testing
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

/**
 * Create a minimal mock AgentState for testing
 */
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

    moltbookLastPostMs: null,
    lastPostedMoltbookReceiptFingerprint: null,
    moltbookFailureCount: 0,
    moltbookCircuitBreakerDisabledUntilMs: null
  };

  return { ...base, ...overrides };
}

/**
 * Create a minimal DecisionContext for testing
 */
function mockContext(cfg: AppConfig, state: AgentState, now?: Date): DecisionContext {
  return {
    cfg,
    state,
    now: now || new Date("2026-01-30T12:00:00Z"),
    wallet: "0x" + "b".repeat(40) as `0x${string}`,
    ethWei: 10n * 10n ** 18n, // 10 ETH
    internAmount: 100_000n * 10n ** 18n // 100k INTERN
  };
}

describe("enforceGuardrails", () => {
  describe("blocks when TRADING_ENABLED=false", () => {
    it("returns HOLD with blockedReason", () => {
      const cfg = mockConfig({ TRADING_ENABLED: false });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.shouldExecute).toBe(false);
      expect(decision.blockedReason).toContain("TRADING_ENABLED=false");
    });
  });

  describe("blocks when KILL_SWITCH=true", () => {
    it("returns HOLD even if trading enabled", () => {
      const cfg = mockConfig({ KILL_SWITCH: true, TRADING_ENABLED: true });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.shouldExecute).toBe(false);
      expect(decision.blockedReason).toContain("KILL_SWITCH=true");
    });
  });

  describe("blocks when DRY_RUN=true and action is trade", () => {
    it("returns HOLD for BUY when DRY_RUN=true", () => {
      const cfg = mockConfig({
        DRY_RUN: true,
        TRADING_ENABLED: true,
        KILL_SWITCH: false
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("DRY_RUN=true");
    });

    it("returns HOLD for SELL when DRY_RUN=true", () => {
      const cfg = mockConfig({
        DRY_RUN: true,
        TRADING_ENABLED: true,
        KILL_SWITCH: false
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "SELL", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("DRY_RUN=true");
    });
  });

  describe("enforces DAILY_TRADE_CAP", () => {
    it("blocks when trades executed today equals cap", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        DAILY_TRADE_CAP: 3
      });
      const state = mockState({ tradesExecutedToday: 3 });
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("daily cap reached");
    });

    it("allows when trades executed is below cap", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        DAILY_TRADE_CAP: 5
      });
      const state = mockState({ tradesExecutedToday: 2 });
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("BUY");
      expect(decision.shouldExecute).toBe(true);
    });
  });

  describe("enforces MIN_INTERVAL_MINUTES", () => {
    it("blocks when last trade was too recent", () => {
      const now = new Date("2026-01-30T12:00:00Z");
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        MIN_INTERVAL_MINUTES: 15
      });
      const state = mockState({ lastExecutedTradeAtMs: fiveMinutesAgo.getTime() });
      const ctx = mockContext(cfg, state, now);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("min interval not met");
    });

    it("allows when min interval has elapsed", () => {
      const now = new Date("2026-01-30T12:00:00Z");
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        MIN_INTERVAL_MINUTES: 15
      });
      const state = mockState({ lastExecutedTradeAtMs: twentyMinutesAgo.getTime() });
      const ctx = mockContext(cfg, state, now);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("BUY");
      expect(decision.shouldExecute).toBe(true);
    });
  });

  describe("enforces MAX_SPEND_ETH_PER_TRADE on BUY", () => {
    it("caps spend to MAX_SPEND_ETH_PER_TRADE", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        MAX_SPEND_ETH_PER_TRADE: "1.5"
      });
      const ethWalletBalance = 10n * 10n ** 18n; // 10 ETH
      const state = mockState();
      const ctx = mockContext(cfg, state);
      ctx.ethWei = ethWalletBalance;
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("BUY");
      expect(decision.shouldExecute).toBe(true);
      // 1.5 ETH in wei
      const expectedMaxWei = 1500000000000000000n;
      expect(decision.buySpendWei).toBeLessThanOrEqual(expectedMaxWei);
    });

    it("blocks BUY when insufficient ETH balance", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        MAX_SPEND_ETH_PER_TRADE: "1.5"
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      ctx.ethWei = 0n; // No ETH
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("insufficient ETH");
    });
  });

  describe("enforces SELL_FRACTION_BPS on SELL", () => {
    it("calculates sell amount from fraction", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        SELL_FRACTION_BPS: 5000 // 50%
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const internBalance = 100_000n * 10n ** 18n; // 100k INTERN
      ctx.internAmount = internBalance;
      const proposal: ProposedAction = { action: "SELL", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("SELL");
      expect(decision.shouldExecute).toBe(true);
      // 50% of 100k INTERN
      const expectedSell = (internBalance * 5000n) / 10000n;
      expect(decision.sellAmount).toBe(expectedSell);
    });

    it("blocks SELL when no INTERN to sell", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        SELL_FRACTION_BPS: 5000
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      ctx.internAmount = 0n; // No INTERN
      const proposal: ProposedAction = { action: "SELL", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("no INTERN to sell");
    });

    it("blocks SELL when fraction too small for balance", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        SELL_FRACTION_BPS: 1 // 0.01% - very tiny
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      ctx.internAmount = 100n; // Small amount such that fraction rounds to 0
      const proposal: ProposedAction = { action: "SELL", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("no INTERN to sell");
    });
  });

  describe("passes when all constraints satisfied", () => {
    it("allows BUY with all guards passed", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        DAILY_TRADE_CAP: 5,
        MIN_INTERVAL_MINUTES: 15,
        MAX_SPEND_ETH_PER_TRADE: "0.5"
      });
      const state = mockState({ tradesExecutedToday: 1 });
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "eth is down" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("BUY");
      expect(decision.shouldExecute).toBe(true);
      expect(decision.blockedReason).toBeNull();
      expect(decision.buySpendWei).toBeGreaterThan(0n);
      expect(decision.rationale).toBe("eth is down");
    });

    it("allows SELL with all guards passed", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40),
        DAILY_TRADE_CAP: 5,
        MIN_INTERVAL_MINUTES: 15,
        SELL_FRACTION_BPS: 3000 // 30%
      });
      const state = mockState({ tradesExecutedToday: 1 });
      const ctx = mockContext(cfg, state);
      ctx.internAmount = 100_000n * 10n ** 18n;
      const proposal: ProposedAction = { action: "SELL", rationale: "pump incoming" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("SELL");
      expect(decision.shouldExecute).toBe(true);
      expect(decision.blockedReason).toBeNull();
      expect(decision.sellAmount).toBeGreaterThan(0n);
      expect(decision.rationale).toBe("pump incoming");
    });

    it("allows HOLD always (no checks needed)", () => {
      // HOLD doesn't require trading to be enabled - it just means "do nothing"
      // So all the trading guards will still block it, but the action itself is HOLD
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: "0x" + "c".repeat(40)
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "HOLD", rationale: "market unclear" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.shouldExecute).toBe(false);
      expect(decision.blockedReason).toBeNull();
    });
  });

  describe("blocks when router not configured", () => {
    it("returns HOLD when ROUTER_TYPE is unknown", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "unknown",
        ROUTER_ADDRESS: undefined
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("router not configured");
    });

    it("returns HOLD when ROUTER_ADDRESS is null", () => {
      const cfg = mockConfig({
        TRADING_ENABLED: true,
        KILL_SWITCH: false,
        DRY_RUN: false,
        ROUTER_TYPE: "aerodrome",
        ROUTER_ADDRESS: undefined
      });
      const state = mockState();
      const ctx = mockContext(cfg, state);
      const proposal: ProposedAction = { action: "BUY", rationale: "test" };

      const decision = enforceGuardrails(proposal, ctx);

      expect(decision.action).toBe("HOLD");
      expect(decision.blockedReason).toContain("router not configured");
    });
  });
});


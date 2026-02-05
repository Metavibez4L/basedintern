import { describe, it, expect } from "vitest";
import { proposeAction } from "../src/agent/brain.js";
import type { BrainContext } from "../src/agent/brain.js";
import type { AppConfig } from "../src/config.js";

// Create a minimal config for testing
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    WALLET_MODE: "private_key",
    PRIVATE_KEY: "0x" + "a".repeat(64),
    CHAIN: "base-sepolia",
    LOOP_MINUTES: 30,
    DRY_RUN: false,
    TRADING_ENABLED: false, // Default: off
    KILL_SWITCH: true,
    DAILY_TRADE_CAP: 2,
    MIN_INTERVAL_MINUTES: 60,
    MAX_SPEND_ETH_PER_TRADE: "0.0005",
    SELL_FRACTION_BPS: 500,
    SLIPPAGE_BPS: 300,
    APPROVE_MAX: false,
    APPROVE_CONFIRMATIONS: 1,
    ROUTER_TYPE: "unknown",
    AERODROME_STABLE: false,
    SOCIAL_MODE: "none",
    SOCIAL_MULTI_TARGETS: "x_api,moltbook",
    X_PHASE1_MENTIONS: false,
    X_POLL_MINUTES: 2,
    ...overrides
  } as AppConfig;
}

// Create a minimal brain context
function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    wallet: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    ethWei: 100_000_000_000_000_000n, // 1 ETH
    internAmount: 1000_000_000_000_000_000n, // 1000 INTERN
    internDecimals: 18,
    priceText: null,
    ...overrides
  };
}

describe("Enhanced fallback policy", () => {
  it("always holds when TRADING_ENABLED=false", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: false });
    const ctx = makeContext();
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("HOLD");
  });

  it("always holds when KILL_SWITCH=true", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: true });
    const ctx = makeContext();
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("HOLD");
  });

  it("always holds when DRY_RUN=true", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: true });
    const ctx = makeContext();
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("HOLD");
  });

  it("proposes BUY when no INTERN balance", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ internAmount: 0n });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("BUY");
    expect(result.rationale).toContain("No INTERN balance");
  });

  it("proposes SELL when ETH balance is very low", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ ethWei: 50_000n }); // 0.0005 ETH
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("SELL");
    expect(result.rationale).toContain("Low ETH balance");
  });

  it("proposes BUY when price is low", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ priceText: "$0.25" });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("BUY");
    expect(result.rationale).toContain("Price low");
  });

  it("proposes SELL when price is high", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ priceText: "$5.00" });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("SELL");
    expect(result.rationale).toContain("Price high");
  });

  it("falls back to probabilistic decision when no clear signal", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ priceText: "unknown" });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toMatch(/BUY|SELL|HOLD/);
    expect(result.rationale).toContain("Probabilistic");
  });

  it("handles unknown price gracefully", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ priceText: "unknown" });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBeDefined();
    // Should not error
  });

  it("parses price with currency symbol", async () => {
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ priceText: "$0.30 (Aerodrome)" });
    const result = await proposeAction(cfg, ctx);
    expect(result.action).toBe("BUY");
  });

  it("deterministic based on wallet address", async () => {
    // Same config and price/balance conditions should give same result
    const cfg = makeConfig({ TRADING_ENABLED: true, KILL_SWITCH: false, DRY_RUN: false });
    const ctx = makeContext({ 
      wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      priceText: "unknown"
    });
    const result1 = await proposeAction(cfg, ctx);

    const result2 = await proposeAction(cfg, ctx);
    expect(result1.action).toBe(result2.action);
  });
});

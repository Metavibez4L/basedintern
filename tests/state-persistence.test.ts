import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { loadState, DEFAULT_STATE } from "../src/agent/state.js";

describe("State persistence & migration", () => {
  it("loads valid state with all required fields", async () => {
    const state = await loadState();
    
    expect(state.dayKey).toBeDefined();
    expect(typeof state.dayKey).toBe("string");
    expect(state.tradesExecutedToday).toBeDefined();
    expect(typeof state.tradesExecutedToday).toBe("number");
    expect(state.schemaVersion).toBeDefined();
    // lastExecutedTradeAtMs can be null or a number
    expect(typeof state.lastExecutedTradeAtMs === "number" || state.lastExecutedTradeAtMs === null).toBe(true);
  });

  it("always includes schema version", () => {
    const state = { ...DEFAULT_STATE };
    expect(state.schemaVersion).toBeDefined();
    expect(typeof state.schemaVersion).toBe("number");
    expect(state.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it("provides meaningful defaults for all fields", async () => {
    const state = await loadState();

    // Core fields should all have values
    expect(state.dayKey).toBeDefined();
    expect(typeof state.tradesExecutedToday).toBe("number");
    expect(typeof state.xApiFailureCount).toBe("number");
    expect(typeof state.lastExecutedTradeAtMs).toBe(state.lastExecutedTradeAtMs === null ? "object" : "number");

    // All fields should be present or undefined (not completely missing)
    expect("dayKey" in state).toBe(true);
    expect("tradesExecutedToday" in state).toBe(true);
    expect("lastSeenNonce" in state).toBe(true);
  });

  it("has UTC day key format", () => {
    const state = DEFAULT_STATE;
    expect(state.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
  });

  it("supports x api circuit breaker state fields", () => {
    const state = DEFAULT_STATE;
    expect("xApiFailureCount" in state).toBe(true);
    expect("xApiCircuitBreakerDisabledUntilMs" in state).toBe(true);
  });

  it("supports activity watcher state fields", () => {
    const state = DEFAULT_STATE;
    expect("lastSeenNonce" in state).toBe(true);
    expect("lastSeenEthWei" in state).toBe(true);
    expect("lastSeenTokenRaw" in state).toBe(true);
    expect("lastSeenBlockNumber" in state).toBe(true);
  });

  it("supports x mentions poller fields", () => {
    const state = DEFAULT_STATE;
    expect("lastSeenMentionId" in state).toBe(true);
    expect("repliedMentionFingerprints" in state).toBe(true);
    expect("lastSuccessfulMentionPollMs" in state).toBe(true);
  });
});

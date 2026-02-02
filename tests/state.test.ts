import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { recordExecutedTrade, type AgentState } from "../src/agent/state.js";

/**
 * Helper to create a mock AgentState
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
 * UTC day key generator (matches the implementation)
 */
function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("recordExecutedTrade", () => {
  describe("basic trade recording", () => {
    it("increments tradesExecutedToday", async () => {
      const state = mockState({ tradesExecutedToday: 1, dayKey: "2026-01-30" });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.tradesExecutedToday).toBe(2);
    });

    it("records lastExecutedTradeAtMs with current timestamp", async () => {
      const state = mockState();
      const at = new Date("2026-01-30T14:30:45.123Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.lastExecutedTradeAtMs).toBe(at.getTime());
    });

    it("preserves other state fields", async () => {
      const state = mockState({
        xApiFailureCount: 3,
        lastPostedReceiptFingerprint: "some-hash",
        dayKey: "2026-01-30"
      });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.xApiFailureCount).toBe(3);
      expect(updated.lastPostedReceiptFingerprint).toBe("some-hash");
    });

    it("does not modify the original state object", async () => {
      const state = mockState({ tradesExecutedToday: 1 });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(state.tradesExecutedToday).toBe(1); // Original unchanged
      expect(updated.tradesExecutedToday).toBe(2); // New copy updated
    });
  });

  describe("UTC midnight boundary reset", () => {
    it("resets tradesExecutedToday when day rolls over", async () => {
      const state = mockState({ dayKey: "2026-01-29", tradesExecutedToday: 5 });
      const at = new Date("2026-01-30T00:00:01Z"); // Next day (UTC)

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-01-30");
      expect(updated.tradesExecutedToday).toBe(1); // Reset and increment
    });

    it("does not reset when recording multiple trades same day", async () => {
      const state = mockState({ dayKey: "2026-01-30", tradesExecutedToday: 2 });
      const at = new Date("2026-01-30T18:00:00Z"); // Same day

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-01-30");
      expect(updated.tradesExecutedToday).toBe(3); // Just increment
    });

    it("correctly identifies UTC day boundaries (not local)", async () => {
      // At UTC midnight exactly
      const state = mockState({ dayKey: "2026-01-29", tradesExecutedToday: 1 });
      const midnight = new Date("2026-01-30T00:00:00Z");

      const updated = await recordExecutedTrade(state, midnight);

      expect(updated.dayKey).toBe("2026-01-30");
      expect(updated.tradesExecutedToday).toBe(1); // Reset + 1
    });

    it("uses UTC date, not local date", async () => {
      // This test ensures we're using UTC, not local time
      const state = mockState({ dayKey: "2026-01-29", tradesExecutedToday: 1 });
      // A timestamp that might be different in UTC vs local
      const at = new Date("2026-01-30T08:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      // dayKey should match UTC date
      expect(updated.dayKey).toBe(utcDayKey(at));
      expect(updated.dayKey).toBe("2026-01-30");
    });
  });

  describe("state consistency", () => {
    it("maintains invariant: tradesExecutedToday >= 1 after recordExecutedTrade", async () => {
      const state = mockState({ tradesExecutedToday: 0 });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.tradesExecutedToday).toBeGreaterThanOrEqual(1);
    });

    it("maintains dayKey matches the given date (UTC)", async () => {
      const at = new Date("2026-02-15T10:30:00Z");
      const state = mockState({ dayKey: "2026-01-30" });

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-02-15");
    });
  });

  describe("edge cases", () => {
    it("handles year boundary transition", async () => {
      const state = mockState({ dayKey: "2025-12-31", tradesExecutedToday: 2 });
      const at = new Date("2026-01-01T00:00:01Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-01-01");
      expect(updated.tradesExecutedToday).toBe(1); // Reset
    });

    it("handles month boundary transition", async () => {
      const state = mockState({ dayKey: "2026-01-31", tradesExecutedToday: 3 });
      const at = new Date("2026-02-01T00:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-02-01");
      expect(updated.tradesExecutedToday).toBe(1); // Reset
    });

    it("handles leap year correctly", async () => {
      // 2024 is a leap year
      const state = mockState({ dayKey: "2024-02-29", tradesExecutedToday: 1 });
      const at = new Date("2024-02-29T12:00:00Z"); // Same day

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2024-02-29");
      expect(updated.tradesExecutedToday).toBe(2);
    });

    it("handles large trade counts", async () => {
      const state = mockState({ tradesExecutedToday: 999 });
      const at = new Date("2026-01-30T23:59:59Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.tradesExecutedToday).toBe(1000);
    });

    it("handles many-day gap between trades", async () => {
      const state = mockState({ dayKey: "2026-01-20", tradesExecutedToday: 5 });
      const at = new Date("2026-01-30T12:00:00Z"); // 10 days later

      const updated = await recordExecutedTrade(state, at);

      expect(updated.dayKey).toBe("2026-01-30");
      expect(updated.tradesExecutedToday).toBe(1); // Reset
    });
  });

  describe("timestamp precision", () => {
    it("records millisecond precision timestamps", async () => {
      const state = mockState();
      const at = new Date("2026-01-30T12:34:56.789Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.lastExecutedTradeAtMs).toBe(at.getTime());
      // Verify millisecond is captured
      expect((updated.lastExecutedTradeAtMs as number) % 1000).toBe(789);
    });

    it("records different timestamps for different trades", async () => {
      const state1 = mockState();
      const at1 = new Date("2026-01-30T10:00:00Z");
      const updated1 = await recordExecutedTrade(state1, at1);

      const at2 = new Date("2026-01-30T11:00:00Z");
      const updated2 = await recordExecutedTrade(updated1, at2);

      expect(updated1.lastExecutedTradeAtMs).toBe(at1.getTime());
      expect(updated2.lastExecutedTradeAtMs).toBe(at2.getTime());
      expect((updated2.lastExecutedTradeAtMs as number)).toBeGreaterThan(updated1.lastExecutedTradeAtMs as number);
    });
  });

  describe("activity watcher state fields", () => {
    it("preserves activity watcher state (lastSeenNonce, etc)", async () => {
      const state = mockState({
        lastSeenNonce: 42,
        lastSeenEthWei: "1000000000000000000",
        lastSeenTokenRaw: "100000000000000000000000",
        lastSeenBlockNumber: 12345
      });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.lastSeenNonce).toBe(42);
      expect(updated.lastSeenEthWei).toBe("1000000000000000000");
      expect(updated.lastSeenTokenRaw).toBe("100000000000000000000000");
      expect(updated.lastSeenBlockNumber).toBe(12345);
    });

    it("preserves null watcher fields if not yet set", async () => {
      const state = mockState({
        lastSeenNonce: null,
        lastSeenEthWei: null,
        lastSeenTokenRaw: null,
        lastSeenBlockNumber: null
      });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.lastSeenNonce).toBeNull();
      expect(updated.lastSeenEthWei).toBeNull();
      expect(updated.lastSeenTokenRaw).toBeNull();
      expect(updated.lastSeenBlockNumber).toBeNull();
    });
  });

  describe("X API state fields", () => {
    it("preserves X API failure count", async () => {
      const state = mockState({ xApiFailureCount: 2 });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.xApiFailureCount).toBe(2);
    });

    it("preserves X API circuit breaker timestamp", async () => {
      const timestamp = new Date("2026-01-30T13:00:00Z").getTime();
      const state = mockState({ xApiCircuitBreakerDisabledUntilMs: timestamp });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.xApiCircuitBreakerDisabledUntilMs).toBe(timestamp);
    });

    it("preserves receipt fingerprint", async () => {
      const fingerprint = "abc123def456";
      const state = mockState({ lastPostedReceiptFingerprint: fingerprint });
      const at = new Date("2026-01-30T12:00:00Z");

      const updated = await recordExecutedTrade(state, at);

      expect(updated.lastPostedReceiptFingerprint).toBe(fingerprint);
    });
  });
});

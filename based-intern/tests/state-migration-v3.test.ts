import { describe, it, expect } from "vitest";
import { migrateStateForTests } from "../src/agent/state.js";

describe("state migration v2 -> v3", () => {
  it("adds news fields without breaking existing fields", async () => {
    const v2 = {
      schemaVersion: 2,
      lastExecutedTradeAtMs: null,
      dayKey: "2026-01-30",
      tradesExecutedToday: 1,
      xApiFailureCount: 0,
      xApiCircuitBreakerDisabledUntilMs: null,
      lastPostedReceiptFingerprint: null,
      lastSeenNonce: null,
      lastSeenEthWei: null,
      lastSeenTokenRaw: null,
      lastSeenBlockNumber: null,
      lastPostDayUtc: null
    };

    const migrated = migrateStateForTests(v2) as any;

    // Existing fields preserved
    expect(migrated.tradesExecutedToday).toBe(1);
    expect(migrated.dayKey).toBe("2026-01-30");

    // New fields initialized
    expect(migrated.newsLastPostMs).toBeNull();
    expect(migrated.newsDailyCount).toBe(0);
    expect(migrated.newsLastPostDayUtc).toBeNull();
    expect(Array.isArray(migrated.seenNewsFingerprints)).toBe(true);
    expect(migrated.seenNewsFingerprints.length).toBe(0);
    expect(migrated.lastPostedNewsFingerprint).toBeNull();
  });
});

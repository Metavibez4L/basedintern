import { describe, it, expect } from "vitest";
import {
  buildAddLiquidityETHCalldata,
  buildAddLiquidityCalldata,
  buildRemoveLiquidityETHCalldata,
  calculatePoolTVL,
  applySlippage,
  calculateAerodromeOutput,
  type AerodromePoolInfo,
} from "../src/chain/aerodrome.js";
import {
  generateLPCampaignPost,
  generateLPStatusPost,
  generateLPGuidePost,
  generateLPMilestonePost,
  generateLPIncentivePost,
  generateLPComparisonPost,
} from "../src/social/lp_campaign.js";
import type { PoolStats } from "../src/chain/liquidity.js";

// ============================================================
// LP Calldata Encoding
// ============================================================

describe("buildAddLiquidityETHCalldata", () => {
  it("produces valid hex calldata with selector", () => {
    const result = buildAddLiquidityETHCalldata({
      token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      stable: false,
      amountTokenDesired: 1000000n,
      amountTokenMin: 950000n,
      amountETHMin: 900000n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    });

    // Should start with 0x and contain hex chars only
    expect(result.calldata.startsWith("0x")).toBe(true);
    expect(/^0x[0-9a-f]+$/i.test(result.calldata)).toBe(true);
    // Should contain 4-byte selector + 7 params * 32 bytes = 4 + 224 = 228 bytes = 456 hex chars + "0x"
    expect(result.calldata.length).toBeGreaterThan(100);
  });

  it("returns deadline and value", () => {
    const result = buildAddLiquidityETHCalldata({
      token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      stable: false,
      amountTokenDesired: 1000000n,
      amountTokenMin: 950000n,
      amountETHMin: 900000n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
      deadlineSeconds: 600,
    });

    expect(result.deadline).toBeGreaterThan(0n);
    expect(result.value).toBe(900000n); // amountETHMin
  });

  it("encodes stable flag correctly", () => {
    const stableResult = buildAddLiquidityETHCalldata({
      token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      stable: true,
      amountTokenDesired: 1000000n,
      amountTokenMin: 950000n,
      amountETHMin: 900000n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    });

    const volatileResult = buildAddLiquidityETHCalldata({
      token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      stable: false,
      amountTokenDesired: 1000000n,
      amountTokenMin: 950000n,
      amountETHMin: 900000n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    });

    // Calldata should differ (stable flag encoded differently)
    expect(stableResult.calldata).not.toBe(volatileResult.calldata);
  });
});

describe("buildAddLiquidityCalldata", () => {
  it("produces valid hex calldata", () => {
    const result = buildAddLiquidityCalldata({
      tokenA: "0x1111111111111111111111111111111111111111" as `0x${string}`,
      tokenB: "0x2222222222222222222222222222222222222222" as `0x${string}`,
      stable: false,
      amountADesired: 1000000n,
      amountBDesired: 2000000n,
      amountAMin: 950000n,
      amountBMin: 1900000n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    });

    expect(result.calldata.startsWith("0x")).toBe(true);
    expect(/^0x[0-9a-f]+$/i.test(result.calldata)).toBe(true);
    expect(result.deadline).toBeGreaterThan(0n);
  });
});

describe("buildRemoveLiquidityETHCalldata", () => {
  it("produces valid hex calldata", () => {
    const result = buildRemoveLiquidityETHCalldata({
      token: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      stable: false,
      liquidity: 500000n,
      amountTokenMin: 0n,
      amountETHMin: 0n,
      to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    });

    expect(result.calldata.startsWith("0x")).toBe(true);
    expect(/^0x[0-9a-f]+$/i.test(result.calldata)).toBe(true);
  });
});

// ============================================================
// Pool TVL Calculation
// ============================================================

describe("calculatePoolTVL", () => {
  it("calculates TVL when WETH is token0", () => {
    const pool: AerodromePoolInfo = {
      poolAddress: "0xaaaa" as `0x${string}`,
      token0: "0x4200000000000000000000000000000000000006" as `0x${string}`, // WETH
      token1: "0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11" as `0x${string}`, // INTERN
      stable: false,
      reserve0: 1000000000000000000n, // 1 ETH
      reserve1: 1000000000000000000000n, // 1000 INTERN
    };
    const weth = "0x4200000000000000000000000000000000000006" as `0x${string}`;

    const { tvlWei } = calculatePoolTVL(pool, weth);
    expect(tvlWei).toBe(2000000000000000000n); // 2 ETH
  });

  it("calculates TVL when WETH is token1", () => {
    const pool: AerodromePoolInfo = {
      poolAddress: "0xbbbb" as `0x${string}`,
      token0: "0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11" as `0x${string}`, // INTERN
      token1: "0x4200000000000000000000000000000000000006" as `0x${string}`, // WETH
      stable: false,
      reserve0: 500000000000000000000n, // 500 INTERN
      reserve1: 500000000000000000n, // 0.5 ETH
    };
    const weth = "0x4200000000000000000000000000000000000006" as `0x${string}`;

    const { tvlWei } = calculatePoolTVL(pool, weth);
    expect(tvlWei).toBe(1000000000000000000n); // 1 ETH
  });
});

// ============================================================
// Slippage Calculation
// ============================================================

describe("applySlippage", () => {
  it("applies 5% slippage correctly", () => {
    const amount = 10000n;
    const result = applySlippage(amount, 500); // 5%
    expect(result).toBe(9500n);
  });

  it("applies 0% slippage", () => {
    const amount = 10000n;
    const result = applySlippage(amount, 0);
    expect(result).toBe(10000n);
  });

  it("applies 3% slippage correctly", () => {
    const amount = 1000000n;
    const result = applySlippage(amount, 300); // 3%
    expect(result).toBe(970000n);
  });
});

// ============================================================
// LP Campaign Social Posts
// ============================================================

const MOLTBOOK_CHAR_LIMIT = 500;

const mockWethPool: PoolStats = {
  poolAddress: "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc" as `0x${string}`,
  pairLabel: "INTERN/WETH",
  reserve0: 1000000000000000000000n,
  reserve1: 1000000000000000000n,
  tvlWei: 2000000000000000000n, // 2 ETH
  lpBalance: 100000000000000000n,
  lpTotalSupply: 1000000000000000000n,
  sharePercent: 10.0,
};

const mockUsdcPool: PoolStats = {
  poolAddress: "0x5555555555555555555555555555555555555555" as `0x${string}`,
  pairLabel: "INTERN/USDC",
  reserve0: 500000000000000000000n,
  reserve1: 1000000000n, // 1000 USDC (6 decimals)
  tvlWei: 500000000000000000n, // 0.5 ETH
  lpBalance: 0n,
  lpTotalSupply: 100000000000000000n,
  sharePercent: 0,
};

describe("generateLPStatusPost", () => {
  it("generates a post under character limit", () => {
    const post = generateLPStatusPost(mockWethPool, mockUsdcPool);
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(post).toContain("aerodrome.finance");
  });

  it("works with null pools", () => {
    const post = generateLPStatusPost(null, null);
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(post).toContain("0.0000");
  });
});

describe("generateLPGuidePost", () => {
  it("generates guide under character limit", () => {
    const post = generateLPGuidePost();
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(post).toContain("aerodrome.finance");
  });
});

describe("generateLPMilestonePost", () => {
  it("generates milestone post with TVL", () => {
    const post = generateLPMilestonePost(0.5);
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(post).toContain("0.50");
  });

  it("generates different posts for different TVL values", () => {
    const low = generateLPMilestonePost(0.1);
    const high = generateLPMilestonePost(10.5);
    // Both should be valid posts
    expect(low.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(high.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    // TVL values should appear
    expect(low).toContain("0.10");
    expect(high).toContain("10.50");
  });
});

describe("generateLPIncentivePost", () => {
  it("generates incentive post under limit", () => {
    const post = generateLPIncentivePost();
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
  });
});

describe("generateLPComparisonPost", () => {
  it("generates comparison post", () => {
    const post = generateLPComparisonPost(mockWethPool, mockUsdcPool);
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
  });
});

describe("generateLPCampaignPost", () => {
  it("generates a random LP campaign post under limit", () => {
    for (let i = 0; i < 20; i++) {
      const post = generateLPCampaignPost(mockWethPool, mockUsdcPool);
      expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
      expect(post.length).toBeGreaterThan(10);
    }
  });

  it("works without pool data", () => {
    const post = generateLPCampaignPost(null, null);
    expect(post.length).toBeLessThanOrEqual(MOLTBOOK_CHAR_LIMIT);
    expect(post.length).toBeGreaterThan(10);
  });
});

// ============================================================
// State Migration v12
// ============================================================

describe("state migration v11 -> v12", () => {
  it("adds LP fields on migration", async () => {
    const { migrateStateForTests } = await import("../src/agent/state.js");
    const oldState = {
      schemaVersion: 11,
      lastExecutedTradeAtMs: null,
      dayKey: "2026-02-06",
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
    };

    const migrated = migrateStateForTests(oldState);
    expect(migrated.lpLastTickMs).toBe(null);
    expect(migrated.lpWethPoolTvlWei).toBe(null);
    expect(migrated.lpUsdcPoolTvlWei).toBe(null);
    // schemaVersion is updated by loadState after migration, not by migrateState itself
    // The migration function just adds fields — the version bump happens on save
    expect(migrated.lpLastTickMs).toEqual(null);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { watchForActivity, parseMinEthDelta, parseMinTokenDelta, type ActivityWatchContext, type ActivityDetectionResult } from "../src/agent/watch.js";
import { parseEther, type Address } from "viem";
import type { PublicClient } from "viem";

/**
 * Create a mock PublicClient with spyable methods
 */
function createMockPublicClient(overrides?: {
  nonce?: number;
  ethBalance?: bigint;
  tokenBalance?: bigint;
  blockNumber?: bigint;
  nonceError?: Error;
  ethBalanceError?: Error;
  tokenBalanceError?: Error;
  blockNumberError?: Error;
}): PublicClient {
  return {
    getTransactionCount: vi.fn(async () => {
      if (overrides?.nonceError) throw overrides.nonceError;
      return overrides?.nonce ?? 42;
    }),
    getBalance: vi.fn(async () => {
      if (overrides?.ethBalanceError) throw overrides.ethBalanceError;
      return overrides?.ethBalance ?? 5n * 10n ** 18n;
    }),
    readContract: vi.fn(async () => {
      if (overrides?.tokenBalanceError) throw overrides.tokenBalanceError;
      return overrides?.tokenBalance ?? 100_000n * 10n ** 18n;
    }),
    getBlockNumber: vi.fn(async () => {
      if (overrides?.blockNumberError) throw overrides.blockNumberError;
      return overrides?.blockNumber ?? 12345n;
    })
  } as unknown as PublicClient;
}

/**
 * Create a minimal ActivityWatchContext for testing
 */
function mockContext(publicClient: PublicClient, overrides?: Partial<ActivityWatchContext>): ActivityWatchContext {
  const walletAddr: Address = ("0x" + "a".repeat(40)) as Address;
  const tokenAddr: Address = ("0x" + "b".repeat(40)) as Address;
  
  const base: ActivityWatchContext = {
    chain: "base-sepolia",
    publicClient,
    walletAddress: walletAddr,
    tokenAddress: tokenAddr,
    decimals: 18,
    minEthDeltaWei: parseEther("0.00001"),
    minTokenDeltaRaw: BigInt(1000) * 10n ** 18n
  };

  return { ...base, ...overrides };
}

describe("watchForActivity", () => {
  describe("nonce increase detection", () => {
    it("detects when nonce increases", async () => {
      const publicClient = createMockPublicClient({ nonce: 50 });
      const ctx = mockContext(publicClient);
      const lastNonce = 42; // Previous nonce

      const result = await watchForActivity(ctx, lastNonce, null, null, null);

      expect(result.changed).toBe(true);
      expect(result.deltas.nonceChanged).toBe(true);
      expect(result.reasons[0]).toMatch(/nonce increased/);
      expect(result.newStatePatch.lastSeenNonce).toBe(50);
    });

    it("does not detect activity when nonce unchanged", async () => {
      const publicClient = createMockPublicClient({ nonce: 42 });
      const ctx = mockContext(publicClient);
      const lastNonce = 42; // Same nonce

      const result = await watchForActivity(ctx, lastNonce, null, null, null);

      // Only nonce change should not trigger overall changed if no other deltas
      expect(result.deltas.nonceChanged).toBe(false);
    });

    it("initializes lastSeenNonce when null", async () => {
      const publicClient = createMockPublicClient({ nonce: 99 });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenNonce).toBe(99);
      expect(result.deltas.nonceChanged).toBe(false);
    });

    it("handles nonce read error gracefully", async () => {
      const publicClient = createMockPublicClient({ nonceError: new Error("RPC failed") });
      const ctx = mockContext(publicClient);
      const lastNonce = 42;

      const result = await watchForActivity(ctx, lastNonce, null, null, null);

      // Should not crash, and nonce should remain null in patch
      expect(result.newStatePatch.lastSeenNonce).toBeNull();
      expect(result.deltas.nonceChanged).toBe(false);
    });
  });

  describe("ETH balance delta detection", () => {
    it("detects when ETH balance increases above MIN_ETH_DELTA", async () => {
      const minDelta = parseEther("0.00001");
      const previousEthWei = 5n * 10n ** 18n; // 5 ETH
      const currentEthWei = previousEthWei + minDelta + 1n; // 5 ETH + delta + 1 wei

      const publicClient = createMockPublicClient({ ethBalance: currentEthWei });
      const ctx = mockContext(publicClient, { minEthDeltaWei: minDelta });

      const result = await watchForActivity(ctx, null, previousEthWei.toString(), null, null);

      expect(result.changed).toBe(true);
      expect(result.deltas.ethChanged).toBe(true);
      expect(result.reasons[0]).toMatch(/ETH balance changed/);
      expect(result.newStatePatch.lastSeenEthWei).toBe(currentEthWei.toString());
    });

    it("detects when ETH balance decreases above MIN_ETH_DELTA", async () => {
      const minDelta = parseEther("0.00001");
      const previousEthWei = 5n * 10n ** 18n;
      const currentEthWei = previousEthWei - minDelta - 1n; // Lost more than delta

      const publicClient = createMockPublicClient({ ethBalance: currentEthWei });
      const ctx = mockContext(publicClient, { minEthDeltaWei: minDelta });

      const result = await watchForActivity(ctx, null, previousEthWei.toString(), null, null);

      expect(result.changed).toBe(true);
      expect(result.deltas.ethChanged).toBe(true);
      expect(result.reasons[0]).toMatch(/ETH balance changed/);
    });

    it("ignores ETH balance changes below MIN_ETH_DELTA", async () => {
      const minDelta = parseEther("0.00001");
      const previousEthWei = 5n * 10n ** 18n;
      const currentEthWei = previousEthWei + 10n; // Only 10 wei change (way below minDelta)

      const publicClient = createMockPublicClient({ ethBalance: currentEthWei });
      const ctx = mockContext(publicClient, { minEthDeltaWei: minDelta });

      const result = await watchForActivity(ctx, null, previousEthWei.toString(), null, null);

      expect(result.deltas.ethChanged).toBe(false);
      expect(result.changed).toBe(false);
    });

    it("initializes lastSeenEthWei when null", async () => {
      const publicClient = createMockPublicClient({ ethBalance: 10n * 10n ** 18n });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenEthWei).toBe((10n * 10n ** 18n).toString());
    });

    it("handles ETH balance read error gracefully", async () => {
      const publicClient = createMockPublicClient({ ethBalanceError: new Error("RPC failed") });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      // Should report 0 balance and store in patch
      expect(result.newStatePatch.lastSeenEthWei).toBe("0");
    });
  });

  describe("token balance delta detection", () => {
    it("detects when token balance increases above MIN_TOKEN_DELTA", async () => {
      const minDelta = BigInt(1000) * 10n ** 18n;
      const previousTokenRaw = 100_000n * 10n ** 18n;
      const currentTokenRaw = previousTokenRaw + minDelta + 1n;

      const publicClient = createMockPublicClient({ tokenBalance: currentTokenRaw });
      const ctx = mockContext(publicClient, { minTokenDeltaRaw: minDelta });

      const result = await watchForActivity(ctx, null, null, previousTokenRaw.toString(), null);

      expect(result.changed).toBe(true);
      expect(result.deltas.tokenChanged).toBe(true);
      expect(result.reasons[0]).toMatch(/Token balance changed/);
      expect(result.newStatePatch.lastSeenTokenRaw).toBe(currentTokenRaw.toString());
    });

    it("detects when token balance decreases above MIN_TOKEN_DELTA", async () => {
      const minDelta = BigInt(1000) * 10n ** 18n;
      const previousTokenRaw = 100_000n * 10n ** 18n;
      const currentTokenRaw = previousTokenRaw - minDelta - 1n;

      const publicClient = createMockPublicClient({ tokenBalance: currentTokenRaw });
      const ctx = mockContext(publicClient, { minTokenDeltaRaw: minDelta });

      const result = await watchForActivity(ctx, null, null, previousTokenRaw.toString(), null);

      expect(result.changed).toBe(true);
      expect(result.deltas.tokenChanged).toBe(true);
    });

    it("ignores token balance changes below MIN_TOKEN_DELTA", async () => {
      const minDelta = BigInt(1000) * 10n ** 18n;
      const previousTokenRaw = 100_000n * 10n ** 18n;
      const currentTokenRaw = previousTokenRaw + 100n; // Only 100 raw (way below minDelta)

      const publicClient = createMockPublicClient({ tokenBalance: currentTokenRaw });
      const ctx = mockContext(publicClient, { minTokenDeltaRaw: minDelta });

      const result = await watchForActivity(ctx, null, null, previousTokenRaw.toString(), null);

      expect(result.deltas.tokenChanged).toBe(false);
    });

    it("does not read token balance when tokenAddress is null", async () => {
      const publicClient = createMockPublicClient();
      const ctx = mockContext(publicClient, { tokenAddress: null });

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.deltas.tokenChanged).toBe(false);
      expect(result.newStatePatch.lastSeenTokenRaw).toBe("0");
    });

    it("initializes lastSeenTokenRaw when null", async () => {
      const publicClient = createMockPublicClient({ tokenBalance: 50_000n * 10n ** 18n });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenTokenRaw).toBe((50_000n * 10n ** 18n).toString());
    });

    it("handles token balance read error gracefully", async () => {
      const publicClient = createMockPublicClient({ tokenBalanceError: new Error("RPC failed") });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenTokenRaw).toBe("0");
    });
  });

  describe("combined detection scenarios", () => {
    it("returns changed=true when nonce and ETH both change", async () => {
      const publicClient = createMockPublicClient({
        nonce: 50,
        ethBalance: 10n * 10n ** 18n
      });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, 42, (5n * 10n ** 18n).toString(), null, null);

      expect(result.changed).toBe(true);
      expect(result.deltas.nonceChanged).toBe(true);
      expect(result.deltas.ethChanged).toBe(true);
    });

    it("returns changed=true when any single metric changes significantly", async () => {
      const publicClient = createMockPublicClient({
        nonce: 42, // unchanged
        ethBalance: 5n * 10n ** 18n, // unchanged
        tokenBalance: 150_000n * 10n ** 18n // increased by 50k
      });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, 42, (5n * 10n ** 18n).toString(), (100_000n * 10n ** 18n).toString(), null);

      expect(result.changed).toBe(true);
      expect(result.deltas.nonceChanged).toBe(false);
      expect(result.deltas.ethChanged).toBe(false);
      expect(result.deltas.tokenChanged).toBe(true);
    });

    it("returns changed=false when all metrics unchanged and within thresholds", async () => {
      const publicClient = createMockPublicClient({
        nonce: 42,
        ethBalance: 5n * 10n ** 18n,
        tokenBalance: 100_000n * 10n ** 18n
      });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, 42, (5n * 10n ** 18n).toString(), (100_000n * 10n ** 18n).toString(), null);

      expect(result.changed).toBe(false);
      expect(result.reasons.length).toBe(0);
    });
  });

  describe("state patch updates", () => {
    it("always updates lastSeenNonce when readable", async () => {
      const publicClient = createMockPublicClient({ nonce: 99 });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenNonce).toBe(99);
    });

    it("always updates lastSeenEthWei", async () => {
      const publicClient = createMockPublicClient({ ethBalance: 7n * 10n ** 18n });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenEthWei).toBe((7n * 10n ** 18n).toString());
    });

    it("always updates lastSeenTokenRaw", async () => {
      const publicClient = createMockPublicClient({ tokenBalance: 75_000n * 10n ** 18n });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenTokenRaw).toBe((75_000n * 10n ** 18n).toString());
    });

    it("always updates lastSeenBlockNumber when readable", async () => {
      const publicClient = createMockPublicClient({ blockNumber: 99999n });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      expect(result.newStatePatch.lastSeenBlockNumber).toBe(99999);
    });

    it("handles block number read error gracefully", async () => {
      const publicClient = createMockPublicClient({ blockNumberError: new Error("RPC failed") });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, null, null, null, null);

      // Block number should remain null on error
      expect(result.newStatePatch.lastSeenBlockNumber).toBeNull();
    });
  });

  describe("restart scenario (same lastSeen values)", () => {
    it("does not flag activity when restarting with identical state", async () => {
      const lastNonce = 42;
      const lastEth = 5n * 10n ** 18n;
      const lastToken = 100_000n * 10n ** 18n;

      const publicClient = createMockPublicClient({
        nonce: lastNonce,
        ethBalance: lastEth,
        tokenBalance: lastToken
      });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, lastNonce, lastEth.toString(), lastToken.toString(), null);

      expect(result.changed).toBe(false);
      expect(result.reasons.length).toBe(0);
    });

    it("does flag activity if something changed since restart", async () => {
      const lastNonce = 42;
      const lastEth = 5n * 10n ** 18n;
      const lastToken = 100_000n * 10n ** 18n;

      const publicClient = createMockPublicClient({
        nonce: 43, // increased
        ethBalance: lastEth,
        tokenBalance: lastToken
      });
      const ctx = mockContext(publicClient);

      const result = await watchForActivity(ctx, lastNonce, lastEth.toString(), lastToken.toString(), null);

      expect(result.changed).toBe(true);
      expect(result.reasons[0]).toMatch(/nonce increased/);
    });
  });
});

describe("parseMinEthDelta", () => {
  it("parses valid ETH string to wei", () => {
    const result = parseMinEthDelta("0.00001");
    const expected = parseEther("0.00001");

    expect(result).toBe(expected);
  });

  it("parses integer ETH strings", () => {
    const result = parseMinEthDelta("1");
    const expected = parseEther("1");

    expect(result).toBe(expected);
  });

  it("returns default on parse error", () => {
    const result = parseMinEthDelta("invalid");
    const defaultValue = parseEther("0.00001");

    expect(result).toBe(defaultValue);
  });
});

describe("parseMinTokenDelta", () => {
  it("parses token amount with decimals", () => {
    const tokenStr = "1000";
    const decimals = 18;

    const result = parseMinTokenDelta(tokenStr, decimals);
    const expected = BigInt(1000) * BigInt(10 ** decimals);

    expect(result).toBe(expected);
  });

  it("handles different decimal places", () => {
    const tokenStr = "500";
    const decimals = 6;

    const result = parseMinTokenDelta(tokenStr, decimals);
    const expected = BigInt(500) * BigInt(10 ** decimals);

    expect(result).toBe(expected);
  });

  it("returns default on parse error", () => {
    const result = parseMinTokenDelta("invalid", 18);
    const defaultValue = BigInt(1000) * BigInt(10 ** 18);

    expect(result).toBe(defaultValue);
  });

  it("handles zero decimals", () => {
    const result = parseMinTokenDelta("100", 0);
    expect(result).toBe(100n);
  });
});

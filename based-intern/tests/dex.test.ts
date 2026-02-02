import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Address } from "viem";
import type { AppConfig } from "../src/config.js";
import type { ChainClients } from "../src/chain/client.js";
import { readBestEffortPrice } from "../src/chain/price.js";
// Do NOT import getDexProviders directly to avoid auto-registration of Aerodrome adapter
// Instead, we'll test the behavior through readBestEffortPrice

// Mock Aerodrome pool data
const mockPoolInfo = {
  poolAddress: "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc" as Address,
  token0: "0x4200000000000000000000000000000000000006", // WETH
  token1: "0xd530521ca9cb47ffd4e851f1fe2e448527010b11", // INTERN
  stable: false,
  reserve0: BigInt("1000000000000000000"), // 1 WETH
  reserve1: BigInt("2000000000000000000") // 2 INTERN (1 INTERN = 0.5 ETH)
};

// Mock clients
const mockPublicClient = {
  readContract: vi.fn(async () => {
    throw new Error("unmocked call");
  })
};

const mockWalletClient = {
  account: { address: "0x1234567890123456789012345678901234567890" as Address }
};

const mockClients: ChainClients = {
  publicClient: mockPublicClient as any,
  walletClient: mockWalletClient as any,
  walletAddress: "0x1234567890123456789012345678901234567890" as Address
};

const mockConfig: AppConfig = {
  CHAIN: "base-sepolia",
  WALLET_MODE: "private_key",
  PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
  STATE_PATH: "data/state.json",
  ERC8004_ENABLED: false,
  OPENAI_API_KEY: "",
  ROUTER_TYPE: "aerodrome",
  ROUTER_ADDRESS: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address,
  POOL_ADDRESS: "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc" as Address,
  WETH_ADDRESS: "0x4200000000000000000000000000000000000006" as Address,
  TOKEN_ADDRESS: "0xd530521ca9cb47ffd4e851f1fe2e448527010b11" as Address,
  AERODROME_STABLE: false,
  SLIPPAGE_BPS: 300,
  DAILY_TRADE_CAP: 2,
  MAX_SPEND_ETH_PER_TRADE: "0.001",
  MIN_INTERVAL_MINUTES: 60,
  SELL_FRACTION_BPS: 500,
  TRADING_ENABLED: false,
  KILL_SWITCH: true,
  DRY_RUN: true,

  CONTROL_ENABLED: false,
  CONTROL_BIND: "0.0.0.0",
  CONTROL_PORT: 8080,
  CONTROL_TOKEN: undefined,
  SOCIAL_MODE: "none",
  SOCIAL_MULTI_TARGETS: "x_api,moltbook",
  LOOP_MINUTES: 30,
  APPROVE_MAX: false,
  APPROVE_CONFIRMATIONS: 1,
  HEADLESS: true,
  X_API_KEY: "",
  X_API_SECRET: "",
  X_ACCESS_TOKEN: "",
  X_ACCESS_SECRET: "",
  X_PHASE1_MENTIONS: false,
  X_POLL_MINUTES: 5,
  X_COOKIES_B64: "",
  X_COOKIES_PATH: "",

  MOLTBOOK_ENABLED: false,
  MOLTBOOK_BASE_URL: "https://www.moltbook.com/api/v1",
  MOLTBOOK_AUTH_MODE: "bearer",
  MOLTBOOK_API_KEY: undefined,
  MOLTBOOK_COOKIE_PATH: "data/moltbook/cookies.json",
  MOLTBOOK_SESSION_PATH: "data/moltbook/session.json",
  MOLTBOOK_USER_AGENT: "BasedIntern/1.0",
  BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
  BASE_RPC_URL: "https://mainnet.base.org",

  NEWS_ENABLED: false,
  NEWS_MODE: "event",
  NEWS_MAX_POSTS_PER_DAY: 2,
  NEWS_MIN_INTERVAL_MINUTES: 120,
  NEWS_MIN_SCORE: 0.5,
  NEWS_FEEDS: "",
  NEWS_GITHUB_FEEDS: "",
  NEWS_REQUIRE_LINK: true,
  NEWS_REQUIRE_SOURCE_WHITELIST: true,
  NEWS_SOURCES: "base_blog,base_dev_blog,cdp_launches",
  NEWS_POSTS_PER_DAY: undefined,
  NEWS_INTERVAL_MINUTES: undefined,
  NEWS_DAILY_HOUR_UTC: 15,
  NEWS_MAX_ITEMS_CONTEXT: 8,
  NEWS_FETCH_INTERVAL_MINUTES: 60,
  NEWS_MIN_RELEVANCE_SCORE: 0.5,
  NEWS_CRYPTO_PANIC_KEY: undefined,
  NEWS_RSS_FEEDS: []
};

describe("DexProvider adapter shape", () => {
  it("returns a price result from Aerodrome adapter when pool configured", async () => {
    // Aerodrome adapter is auto-registered on import
    // This test verifies it returns a valid result structure when called
    const result = await readBestEffortPrice(mockConfig, mockClients, mockConfig.TOKEN_ADDRESS as Address);
    
    // Should have a result structure (text/source, even if text is null from mock)
    expect(result).toBeDefined();
    expect(typeof result.text === "string" || result.text === null).toBe(true);
    expect(typeof result.source).toBe("string");
  });

  it("returns unknown when no POOL_ADDRESS configured", async () => {
    const configNoPool = { ...mockConfig, POOL_ADDRESS: undefined };
    const result = await readBestEffortPrice(configNoPool, mockClients, mockConfig.TOKEN_ADDRESS as Address);
    expect(result.source).toBe("unknown");
  });

  it("returns unknown when ROUTER_TYPE is not aerodrome", async () => {
    const configWrongRouter = { ...mockConfig, ROUTER_TYPE: "uniswap" as any };
    const result = await readBestEffortPrice(configWrongRouter, mockClients, mockConfig.TOKEN_ADDRESS as Address);
    expect(result.source).toBe("unknown");
  });
});

describe("DexProvider adapter shape", () => {
  it("Aerodrome adapter supports getPrice, buildBuyCalldata, and buildSellCalldata", async () => {
    const { AerodromeAdapter } = await import("../src/chain/dex/aerodromeAdapter.js");
    
    expect(AerodromeAdapter).toBeDefined();
    expect(AerodromeAdapter.name).toBe("aerodrome");
    expect(typeof AerodromeAdapter.getPrice).toBe("function");
    expect(typeof (AerodromeAdapter as any).buildBuyCalldata).toBe("function");
    expect(typeof (AerodromeAdapter as any).buildSellCalldata).toBe("function");
  });

  it("buildBuyCalldata returns null on missing config", async () => {
    const { AerodromeAdapter } = await import("../src/chain/dex/aerodromeAdapter.js");
    
    const configNoPool = { ...mockConfig, POOL_ADDRESS: undefined };
    const result = await (AerodromeAdapter as any).buildBuyCalldata(
      configNoPool,
      mockClients,
      mockConfig.TOKEN_ADDRESS as Address,
      mockConfig.WETH_ADDRESS as Address,
      mockClients.walletAddress,
      BigInt("1000000000000000000")
    );
    
    expect(result).toBe(null);
  });

  it("buildSellCalldata returns null on missing config", async () => {
    const { AerodromeAdapter } = await import("../src/chain/dex/aerodromeAdapter.js");
    
    const configNoRouter = { ...mockConfig, ROUTER_ADDRESS: undefined };
    const result = await (AerodromeAdapter as any).buildSellCalldata(
      configNoRouter,
      mockClients,
      mockConfig.TOKEN_ADDRESS as Address,
      mockConfig.WETH_ADDRESS as Address,
      mockClients.walletAddress,
      BigInt("1000000000000000000")
    );
    
    expect(result).toBe(null);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("Config validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to a safe baseline
    process.env = { ...originalEnv };
    delete process.env.BASE_SEPOLIA_RPC_URL;
    delete process.env.BASE_RPC_URL;
    delete process.env.RPC_URL;
    delete process.env.PRIVATE_KEY;
    delete process.env.CHAIN;
    delete process.env.TRADING_ENABLED;
    delete process.env.KILL_SWITCH;
    delete process.env.ROUTER_ADDRESS;
    delete process.env.WETH_ADDRESS;
    delete process.env.ROUTER_TYPE;
    delete process.env.POOL_ADDRESS;
    delete process.env.MAX_SPEND_ETH_PER_TRADE;
    delete process.env.DAILY_TRADE_CAP;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects invalid MAX_SPEND_ETH_PER_TRADE", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.MAX_SPEND_ETH_PER_TRADE = "not-a-number";

    expect(() => loadConfig()).toThrow(/MAX_SPEND_ETH_PER_TRADE must be a valid decimal/);
  });

  it("rejects negative MAX_SPEND_ETH_PER_TRADE", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.MAX_SPEND_ETH_PER_TRADE = "-0.001";

    expect(() => loadConfig()).toThrow(/MAX_SPEND_ETH_PER_TRADE must be a valid decimal/);
  });

  it("rejects TRADING_ENABLED without KILL_SWITCH=false", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "true";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";

    expect(() => loadConfig()).toThrow(/KILL_SWITCH must be false/);
  });

  it("rejects TRADING_ENABLED without ROUTER_ADDRESS", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";

    expect(() => loadConfig()).toThrow(/ROUTER_ADDRESS is required/);
  });

  it("rejects TRADING_ENABLED without WETH_ADDRESS", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";

    expect(() => loadConfig()).toThrow(/WETH_ADDRESS is required/);
  });

  it("rejects TRADING_ENABLED with ROUTER_TYPE=unknown", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "unknown";

    expect(() => loadConfig()).toThrow(/ROUTER_TYPE must not be 'unknown'/);
  });

  it("rejects TRADING_ENABLED with ROUTER_TYPE=aerodrome but no POOL_ADDRESS", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";

    expect(() => loadConfig()).toThrow(/POOL_ADDRESS is required when ROUTER_TYPE=aerodrome/);
  });

  it("rejects TRADING_ENABLED with DAILY_TRADE_CAP=0", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";
    process.env.POOL_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.DAILY_TRADE_CAP = "0";

    expect(() => loadConfig()).toThrow(/DAILY_TRADE_CAP must be > 0/);
  });

  it("rejects TRADING_ENABLED with zero MAX_SPEND_ETH_PER_TRADE", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";
    process.env.POOL_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.MAX_SPEND_ETH_PER_TRADE = "0";

    expect(() => loadConfig()).toThrow(/MAX_SPEND_ETH_PER_TRADE must be > 0/);
  });

  it("accepts SOCIAL_MODE=none without cookies", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.SOCIAL_MODE = "none";

    const cfg = loadConfig();
    expect(cfg.SOCIAL_MODE).toBe("none");
  });

  it("accepts valid trading config", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "true";
    process.env.KILL_SWITCH = "false";
    process.env.ROUTER_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.WETH_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.ROUTER_TYPE = "aerodrome";
    process.env.POOL_ADDRESS = "0x1234567890123456789012345678901234567890";
    process.env.MAX_SPEND_ETH_PER_TRADE = "0.001";
    process.env.DAILY_TRADE_CAP = "5";

    const cfg = loadConfig();
    expect(cfg.TRADING_ENABLED).toBe(true);
    expect(cfg.ROUTER_ADDRESS).toBe("0x1234567890123456789012345678901234567890");
  });

  it("accepts valid DRY_RUN config (trading disabled)", () => {
    process.env.RPC_URL = "http://localhost:8545";
    process.env.PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.TRADING_ENABLED = "false";
    process.env.DRY_RUN = "true";

    const cfg = loadConfig();
    expect(cfg.TRADING_ENABLED).toBe(false);
    expect(cfg.DRY_RUN).toBe(true);
  });
});

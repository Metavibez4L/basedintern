/**
 * Application Configuration
 * 
 * Centralized configuration management for the based-intern agent.
 * All environment variables are parsed and validated here.
 */

import { type Address } from "viem";

// ============================================================================
// Types
// ============================================================================

export type ChainKey = "base" | "base-sepolia";
export type WalletMode = "private_key" | "cdp";
export type SocialMode = "none" | "single" | "multi" | "auto";
export type RouterType = "unknown" | "aerodrome" | "uniswap_v3";
export type AuthMode = "bearer" | "cookie";

export interface AppConfig {
  // Chain settings
  CHAIN: ChainKey;
  RPC_URL?: string;
  BASE_RPC_URL?: string;
  BASE_SEPOLIA_RPC_URL?: string;

  // Wallet settings
  WALLET_MODE: WalletMode;
  PRIVATE_KEY?: string;
  CDP_API_KEY_NAME?: string;
  CDP_API_KEY_PRIVATE_KEY?: string;

  // Trading settings
  TRADING_ENABLED: boolean;
  DRY_RUN: boolean;
  KILL_SWITCH: boolean;
  LOOP_MINUTES: number;
  DAILY_TRADE_CAP: number;
  MIN_INTERVAL_MINUTES: number;
  MAX_SPEND_ETH_PER_TRADE: string;
  SELL_FRACTION_BPS: number;
  SLIPPAGE_BPS: number;
  APPROVE_MAX: boolean;
  APPROVE_CONFIRMATIONS: number;

  // Router/DEX settings
  ROUTER_TYPE: RouterType;
  ROUTER_ADDRESS?: string;
  WETH_ADDRESS?: string;
  POOL_ADDRESS?: string;
  AERODROME_STABLE: boolean;

  // Token settings
  TOKEN_ADDRESS?: string;
  TOKEN_SYMBOL?: string;
  TOKEN_DECIMALS?: number;

  // LP settings
  LP_ENABLED?: boolean;
  LP_MAX_ETH_PER_ADD?: string;
  LP_MAX_TOKEN_FRACTION_BPS?: number;
  LP_SLIPPAGE_BPS?: number;
  USDC_ADDRESS?: string;
  POOL_ADDRESS_USDC?: string;
  POOL_ADDRESS_USDC_STABLE?: boolean;
  GAUGE_ADDRESS_WETH?: string;
  GAUGE_ADDRESS_USDC?: string;

  // Social settings
  SOCIAL_MODE: SocialMode;
  SOCIAL_MULTI_TARGETS: string;
  X_PHASE1_MENTIONS: boolean;
  X_POLL_MINUTES: number;

  // X API settings
  X_API_BEARER_TOKEN?: string;
  X_API_BASE_URL?: string;

  // Moltbook settings
  MOLTBOOK_ENABLED?: boolean;
  MOLTBOOK_BASE_URL?: string;
  MOLTBOOK_AUTH_MODE?: AuthMode;
  MOLTBOOK_API_KEY?: string;
  MOLTBOOK_COOKIE_PATH?: string;
  MOLTBOOK_SESSION_PATH?: string;
  MOLTBOOK_USER_AGENT?: string;

  // OpenClaw settings
  OPENCLAW_API_KEY?: string;
  OPENCLAW_BASE_URL?: string;

  // ERC-8004 identity settings
  ERC8004_ENABLED?: boolean;
  ERC8004_IDENTITY_REGISTRY?: string;
  ERC8004_AGENT_ID?: string;
  ERC8004_AGENT_URI?: string;
  erc8004?: {
    enabled: boolean;
    chainId: number;
    agentRegistryId: string;
    agentRef: string;
  };

  // Misc
  OPENAI_API_KEY?: string;
  NEWS_ENABLED?: boolean;
  NEWS_MIN_SCORE?: number;
  NEWS_MAX_ITEMS_PER_TICK?: number;
  CONTROL_SERVER_PORT?: number;
  DATA_DIR?: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

// ============================================================================
// Config Loading
// ============================================================================

export function loadConfig(): AppConfig {
  const chain = (getEnv("CHAIN", "base") as ChainKey) || "base";
  
  // Determine RPC URL
  const rpcUrl = getEnv("RPC_URL") || 
    (chain === "base" ? getEnv("BASE_RPC_URL") : getEnv("BASE_SEPOLIA_RPC_URL"));

  // Wallet configuration
  const walletMode = (getEnv("WALLET_MODE", "private_key") as WalletMode) || "private_key";
  let privateKey: string | undefined;
  
  if (walletMode === "private_key") {
    privateKey = getEnv("PRIVATE_KEY");
    if (!privateKey) {
      throw new Error("PRIVATE_KEY is required when WALLET_MODE=private_key");
    }
    // Validate private key format
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey) && !/^[a-fA-F0-9]{64}$/.test(privateKey)) {
      throw new Error("PRIVATE_KEY must be a valid 64-character hex string (with or without 0x prefix)");
    }
  }

  // Trading configuration
  const tradingEnabled = parseBool(getEnv("TRADING_ENABLED"), false);
  const dryRun = parseBool(getEnv("DRY_RUN"), false);
  const killSwitch = parseBool(getEnv("KILL_SWITCH"), true);

  if (tradingEnabled) {
    if (killSwitch) {
      throw new Error("KILL_SWITCH must be false when TRADING_ENABLED=true");
    }
    if (dryRun) {
      throw new Error("DRY_RUN must be false when TRADING_ENABLED=true");
    }
    
    const routerAddress = getEnv("ROUTER_ADDRESS");
    if (!routerAddress) {
      throw new Error("ROUTER_ADDRESS is required when TRADING_ENABLED=true");
    }
    if (!isAddress(routerAddress)) {
      throw new Error("ROUTER_ADDRESS must be a valid Ethereum address");
    }

    const wethAddress = getEnv("WETH_ADDRESS");
    if (!wethAddress) {
      throw new Error("WETH_ADDRESS is required when TRADING_ENABLED=true");
    }
    if (!isAddress(wethAddress)) {
      throw new Error("WETH_ADDRESS must be a valid Ethereum address");
    }

    const routerType = (getEnv("ROUTER_TYPE", "unknown") as RouterType);
    if (routerType === "unknown") {
      throw new Error("ROUTER_TYPE must not be 'unknown' when TRADING_ENABLED=true");
    }

    if (routerType === "aerodrome") {
      const poolAddress = getEnv("POOL_ADDRESS");
      if (!poolAddress) {
        throw new Error("POOL_ADDRESS is required when ROUTER_TYPE=aerodrome");
      }
      if (!isAddress(poolAddress)) {
        throw new Error("POOL_ADDRESS must be a valid Ethereum address");
      }
    }

    const dailyTradeCap = parseIntEnv(getEnv("DAILY_TRADE_CAP"), 2);
    if (dailyTradeCap <= 0) {
      throw new Error("DAILY_TRADE_CAP must be > 0");
    }

    const maxSpend = getEnv("MAX_SPEND_ETH_PER_TRADE", "0.001");
    const maxSpendNum = parseFloat(maxSpend);
    if (isNaN(maxSpendNum) || maxSpendNum <= 0) {
      throw new Error("MAX_SPEND_ETH_PER_TRADE must be a valid decimal > 0");
    }
  }

  // Social configuration
  const socialMode = (getEnv("SOCIAL_MODE", "none") as SocialMode) || "none";

  // ERC-8004 configuration
  const erc8004Enabled = parseBool(getEnv("ERC8004_ENABLED"), false);
  let erc8004Config: AppConfig["erc8004"] | undefined;
  
  if (erc8004Enabled) {
    const identityRegistry = getEnv("ERC8004_IDENTITY_REGISTRY");
    if (!identityRegistry) {
      throw new Error("ERC8004_IDENTITY_REGISTRY is required when ERC8004_ENABLED=true");
    }
    if (!isAddress(identityRegistry)) {
      throw new Error("ERC8004_IDENTITY_REGISTRY must be a valid Ethereum address");
    }

    const agentId = getEnv("ERC8004_AGENT_ID");
    if (!agentId) {
      throw new Error("ERC8004_AGENT_ID is required when ERC8004_ENABLED=true");
    }

    const chainId = chain === "base" ? 8453 : 84532;
    erc8004Config = {
      enabled: true,
      chainId,
      agentRegistryId: `eip155:${chainId}:${identityRegistry}`,
      agentRef: `eip155:${chainId}:${identityRegistry}#${agentId}`,
    };
  }

  return {
    // Chain
    CHAIN: chain,
    RPC_URL: rpcUrl,
    BASE_RPC_URL: getEnv("BASE_RPC_URL"),
    BASE_SEPOLIA_RPC_URL: getEnv("BASE_SEPOLIA_RPC_URL"),

    // Wallet
    WALLET_MODE: walletMode,
    PRIVATE_KEY: privateKey,
    CDP_API_KEY_NAME: getEnv("CDP_API_KEY_NAME"),
    CDP_API_KEY_PRIVATE_KEY: getEnv("CDP_API_KEY_PRIVATE_KEY"),

    // Trading
    TRADING_ENABLED: tradingEnabled,
    DRY_RUN: dryRun,
    KILL_SWITCH: killSwitch,
    LOOP_MINUTES: parseIntEnv(getEnv("LOOP_MINUTES"), 30),
    DAILY_TRADE_CAP: parseIntEnv(getEnv("DAILY_TRADE_CAP"), 2),
    MIN_INTERVAL_MINUTES: parseIntEnv(getEnv("MIN_INTERVAL_MINUTES"), 60),
    MAX_SPEND_ETH_PER_TRADE: getEnv("MAX_SPEND_ETH_PER_TRADE", "0.001"),
    SELL_FRACTION_BPS: parseIntEnv(getEnv("SELL_FRACTION_BPS"), 500),
    SLIPPAGE_BPS: parseIntEnv(getEnv("SLIPPAGE_BPS"), 300),
    APPROVE_MAX: parseBool(getEnv("APPROVE_MAX"), false),
    APPROVE_CONFIRMATIONS: parseIntEnv(getEnv("APPROVE_CONFIRMATIONS"), 1),

    // Router/DEX
    ROUTER_TYPE: (getEnv("ROUTER_TYPE", "unknown") as RouterType),
    ROUTER_ADDRESS: getEnv("ROUTER_ADDRESS"),
    WETH_ADDRESS: getEnv("WETH_ADDRESS"),
    POOL_ADDRESS: getEnv("POOL_ADDRESS"),
    AERODROME_STABLE: parseBool(getEnv("AERODROME_STABLE"), false),

    // Token
    TOKEN_ADDRESS: getEnv("TOKEN_ADDRESS"),
    TOKEN_SYMBOL: getEnv("TOKEN_SYMBOL", "INTERN"),
    TOKEN_DECIMALS: parseIntEnv(getEnv("TOKEN_DECIMALS"), 18),

    // LP
    LP_ENABLED: parseBool(getEnv("LP_ENABLED"), false),
    LP_MAX_ETH_PER_ADD: getEnv("LP_MAX_ETH_PER_ADD"),
    LP_MAX_TOKEN_FRACTION_BPS: parseIntEnv(getEnv("LP_MAX_TOKEN_FRACTION_BPS"), 2500),
    LP_SLIPPAGE_BPS: parseIntEnv(getEnv("LP_SLIPPAGE_BPS"), 300),
    USDC_ADDRESS: getEnv("USDC_ADDRESS"),
    POOL_ADDRESS_USDC: getEnv("POOL_ADDRESS_USDC"),
    POOL_ADDRESS_USDC_STABLE: parseBool(getEnv("POOL_ADDRESS_USDC_STABLE"), false),
    GAUGE_ADDRESS_WETH: getEnv("GAUGE_ADDRESS_WETH"),
    GAUGE_ADDRESS_USDC: getEnv("GAUGE_ADDRESS_USDC"),

    // Social
    SOCIAL_MODE: socialMode,
    SOCIAL_MULTI_TARGETS: getEnv("SOCIAL_MULTI_TARGETS", "x_api,moltbook"),
    X_PHASE1_MENTIONS: parseBool(getEnv("X_PHASE1_MENTIONS"), false),
    X_POLL_MINUTES: parseIntEnv(getEnv("X_POLL_MINUTES"), 2),

    // X API
    X_API_BEARER_TOKEN: getEnv("X_API_BEARER_TOKEN"),
    X_API_BASE_URL: getEnv("X_API_BASE_URL", "https://api.x.com"),

    // Moltbook
    MOLTBOOK_ENABLED: parseBool(getEnv("MOLTBOOK_ENABLED"), false),
    MOLTBOOK_BASE_URL: getEnv("MOLTBOOK_BASE_URL", "https://www.moltbook.com/api/v1"),
    MOLTBOOK_AUTH_MODE: (getEnv("MOLTBOOK_AUTH_MODE", "bearer") as AuthMode),
    MOLTBOOK_API_KEY: getEnv("MOLTBOOK_API_KEY"),
    MOLTBOOK_COOKIE_PATH: getEnv("MOLTBOOK_COOKIE_PATH", "data/moltbook/cookies.json"),
    MOLTBOOK_SESSION_PATH: getEnv("MOLTBOOK_SESSION_PATH", "data/moltbook/session.json"),
    MOLTBOOK_USER_AGENT: getEnv("MOLTBOOK_USER_AGENT", "BasedIntern/1.0"),

    // OpenClaw
    OPENCLAW_API_KEY: getEnv("OPENCLAW_API_KEY"),
    OPENCLAW_BASE_URL: getEnv("OPENCLAW_BASE_URL", "https://api.openclaw.ai"),

    // ERC-8004
    ERC8004_ENABLED: erc8004Enabled,
    ERC8004_IDENTITY_REGISTRY: getEnv("ERC8004_IDENTITY_REGISTRY"),
    ERC8004_AGENT_ID: getEnv("ERC8004_AGENT_ID"),
    ERC8004_AGENT_URI: getEnv("ERC8004_AGENT_URI"),
    erc8004: erc8004Config,

    // Misc
    OPENAI_API_KEY: getEnv("OPENAI_API_KEY"),
    NEWS_ENABLED: parseBool(getEnv("NEWS_ENABLED"), false),
    NEWS_MIN_SCORE: parseIntEnv(getEnv("NEWS_MIN_SCORE"), 60),
    NEWS_MAX_ITEMS_PER_TICK: parseIntEnv(getEnv("NEWS_MAX_ITEMS_PER_TICK"), 3),
    CONTROL_SERVER_PORT: parseIntEnv(getEnv("CONTROL_SERVER_PORT"), 3001),
    DATA_DIR: getEnv("DATA_DIR", "data"),
  };
}

// ============================================================================
// RPC URL Helper
// ============================================================================

export function rpcUrlForChain(cfg: AppConfig): string | undefined {
  return cfg.RPC_URL || 
    (cfg.CHAIN === "base" ? cfg.BASE_RPC_URL : cfg.BASE_SEPOLIA_RPC_URL);
}

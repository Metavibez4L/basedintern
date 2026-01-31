import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Load env from project dir first, then fall back to repo-root (.env) if present.
// This avoids confusion when running from `based-intern/` while editing `../.env`.
const localEnvPath = path.join(process.cwd(), ".env");
if (existsSync(localEnvPath)) dotenv.config({ path: localEnvPath });
const repoRootEnvPath = path.resolve(process.cwd(), "..", ".env");
if (existsSync(repoRootEnvPath)) dotenv.config({ path: repoRootEnvPath, override: false });

const BoolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const Chain = z.enum(["base-sepolia", "base"]);
const WalletMode = z.enum(["private_key", "cdp"]);
const SocialMode = z.enum(["none", "playwright", "x_api"]);
const RouterType = z.enum(["unknown", "aerodrome", "uniswap-v3"]);
const NewsMode = z.enum(["event", "daily"]);

const envSchemaBase = z.object({
  // Wallet
  WALLET_MODE: WalletMode.default("private_key"),
  PRIVATE_KEY: z.string().default(""),
  CDP_API_KEY_NAME: z.string().optional(),
  CDP_API_KEY_PRIVATE_KEY: z.string().optional(),

  // Network
  CHAIN: Chain.default("base-sepolia"),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  BASE_RPC_URL: z.string().optional(),
  RPC_URL: z.string().optional(),
  TOKEN_ADDRESS: z.string().optional(),

  // Agent runtime
  LOOP_MINUTES: z.coerce.number().int().positive().default(30),
  DRY_RUN: BoolFromString.default("true"),
  TRADING_ENABLED: BoolFromString.default("false"),
  KILL_SWITCH: BoolFromString.default("true"),

  // Guardrails
  DAILY_TRADE_CAP: z.coerce.number().int().min(0).default(2),
  MIN_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(60),
  MAX_SPEND_ETH_PER_TRADE: z.string().default("0.0005"),
  SELL_FRACTION_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  SLIPPAGE_BPS: z.coerce.number().int().min(0).max(10_000).default(300),

  // ERC20 approvals for trading
  APPROVE_MAX: BoolFromString.default("false"), // if true, approve MaxUint256 instead of exact amount
  APPROVE_CONFIRMATIONS: z.coerce.number().int().min(0).max(10).default(1), // wait for N confirmations

  // Trading config (scaffolded)
  WETH_ADDRESS: z.string().optional(),
  ROUTER_TYPE: RouterType.default("unknown"),
  ROUTER_ADDRESS: z.string().optional(),
  POOL_ADDRESS: z.string().optional(),

  // Aerodrome-specific
  AERODROME_STABLE: BoolFromString.default("false"), // true = stable pair, false = volatile
  AERODROME_GAUGE_ADDRESS: z.string().optional(),

  // Social posting
  SOCIAL_MODE: SocialMode.default("none"),
  HEADLESS: BoolFromString.default("true"),
  X_USERNAME: z.string().optional(),
  X_PASSWORD: z.string().optional(),
  X_COOKIES_PATH: z.string().optional(),
  // Optional: allow providing cookies via env (Railway-friendly).
  // If set, the app can write X_COOKIES_PATH at startup.
  X_COOKIES_B64: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),

  // X Phase 1 mentions poller (intent recognition, no execution)
  X_PHASE1_MENTIONS: BoolFromString.default("false"), // Enable mention polling + intent replies
  X_POLL_MINUTES: z.coerce.number().int().min(1).default(2), // How often to poll mentions (minutes)

  // LLM
  OPENAI_API_KEY: z.string().optional(),

  // =========================
  // Base News Brain (optional)
  // =========================
  NEWS_ENABLED: BoolFromString.default("false"),
  NEWS_MODE: NewsMode.default("event"),
  NEWS_MAX_POSTS_PER_DAY: z.coerce.number().int().positive().default(2),
  NEWS_MIN_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(120),
  NEWS_REQUIRE_LINK: BoolFromString.default("true"),
  NEWS_REQUIRE_SOURCE_WHITELIST: BoolFromString.default("true"),
  NEWS_SOURCES: z.string().default("base_blog,base_dev_blog,cdp_launches"),
  NEWS_DAILY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(15),
  NEWS_MAX_ITEMS_CONTEXT: z.coerce.number().int().min(1).max(50).default(8)
});

const envSchema = envSchemaBase.superRefine((cfg, ctx) => {
  // RPC requirements:
  // - If RPC_URL is set, we accept it.
  // - Otherwise, require the chain-specific URL for the selected CHAIN.
  if (!cfg.RPC_URL || !cfg.RPC_URL.trim()) {
    if (cfg.CHAIN === "base-sepolia") {
      if (!cfg.BASE_SEPOLIA_RPC_URL || !cfg.BASE_SEPOLIA_RPC_URL.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BASE_SEPOLIA_RPC_URL"],
          message: "BASE_SEPOLIA_RPC_URL is required when CHAIN=base-sepolia (unless RPC_URL is set)"
        });
      }
    } else {
      if (!cfg.BASE_RPC_URL || !cfg.BASE_RPC_URL.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BASE_RPC_URL"],
          message: "BASE_RPC_URL is required when CHAIN=base (unless RPC_URL is set)"
        });
      }
    }
  }

  // Social mode requirements
  if (cfg.SOCIAL_MODE === "x_api") {
    const req = (key: "X_API_KEY" | "X_API_SECRET" | "X_ACCESS_TOKEN" | "X_ACCESS_SECRET") => {
      const v = cfg[key];
      if (!v || !v.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when SOCIAL_MODE=x_api`
        });
      }
    };
    req("X_API_KEY");
    req("X_API_SECRET");
    req("X_ACCESS_TOKEN");
    req("X_ACCESS_SECRET");
  }
});

export type AppConfig = z.infer<typeof envSchema>;

function validateGuardrails(cfg: AppConfig): string[] {
  const errors: string[] = [];

  // Parse and validate MAX_SPEND_ETH_PER_TRADE
  const spend = parseFloat(cfg.MAX_SPEND_ETH_PER_TRADE);
  if (isNaN(spend) || spend < 0) {
    errors.push(`MAX_SPEND_ETH_PER_TRADE must be a valid decimal: ${cfg.MAX_SPEND_ETH_PER_TRADE}`);
  }

  // If trading is enabled, enforce trading config
  if (cfg.TRADING_ENABLED) {
    if (cfg.KILL_SWITCH) {
      errors.push("KILL_SWITCH must be false to enable trading (TRADING_ENABLED=true)");
    }
    if (!cfg.ROUTER_ADDRESS || !cfg.ROUTER_ADDRESS.trim()) {
      errors.push("ROUTER_ADDRESS is required when TRADING_ENABLED=true");
    }
    if (!cfg.WETH_ADDRESS || !cfg.WETH_ADDRESS.trim()) {
      errors.push("WETH_ADDRESS is required when TRADING_ENABLED=true");
    }
    if (cfg.ROUTER_TYPE === "unknown") {
      errors.push("ROUTER_TYPE must not be 'unknown' when TRADING_ENABLED=true");
    }
    if (cfg.DAILY_TRADE_CAP <= 0) {
      errors.push("DAILY_TRADE_CAP must be > 0 when TRADING_ENABLED=true");
    }
    if (spend <= 0) {
      errors.push("MAX_SPEND_ETH_PER_TRADE must be > 0 when TRADING_ENABLED=true");
    }
  }

  // If Aerodrome is configured, require POOL_ADDRESS
  if (cfg.ROUTER_TYPE === "aerodrome" && (!cfg.POOL_ADDRESS || !cfg.POOL_ADDRESS.trim())) {
    errors.push("POOL_ADDRESS is required when ROUTER_TYPE=aerodrome");
  }

  // Social mode consistency
  if (cfg.SOCIAL_MODE === "playwright") {
    if (!cfg.X_COOKIES_PATH && !cfg.X_COOKIES_B64) {
      errors.push("X_COOKIES_PATH or X_COOKIES_B64 is required when SOCIAL_MODE=playwright");
    }
  }

  // =========================
  // News Brain guardrails
  // =========================
  if (cfg.NEWS_ENABLED) {
    if (cfg.SOCIAL_MODE !== "x_api" && cfg.SOCIAL_MODE !== "none") {
      errors.push("When NEWS_ENABLED=true, SOCIAL_MODE must be x_api or none");
    }
    if (cfg.NEWS_MAX_POSTS_PER_DAY <= 0) {
      errors.push("NEWS_MAX_POSTS_PER_DAY must be > 0 when NEWS_ENABLED=true");
    }
    if (cfg.NEWS_MIN_INTERVAL_MINUTES < 1) {
      errors.push("NEWS_MIN_INTERVAL_MINUTES must be >= 1 when NEWS_ENABLED=true");
    }
    if (cfg.NEWS_MODE === "daily") {
      // Zod already constrains this, but keep a clear guardrail error for operators.
      if (cfg.NEWS_DAILY_HOUR_UTC < 0 || cfg.NEWS_DAILY_HOUR_UTC > 23) {
        errors.push("NEWS_DAILY_HOUR_UTC must be an integer 0-23 when NEWS_MODE=daily");
      }
    }
  }

  return errors;
}

export function loadConfig(): AppConfig {
  const cfg = envSchema.parse(process.env);

  // Enforce "private_key required by default" without blocking CDP experimentation.
  if (cfg.WALLET_MODE === "private_key" && !cfg.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required when WALLET_MODE=private_key");
  }

  // Validate guardrails and trading consistency
  const guardErrors = validateGuardrails(cfg);
  if (guardErrors.length > 0) {
    throw new Error(`Config validation errors:\n${guardErrors.map((e) => `  - ${e}`).join("\n")}`);
  }

  return cfg;
}

export function rpcUrlForChain(cfg: AppConfig): string {
  const url = (cfg.RPC_URL && cfg.RPC_URL.trim()) ? cfg.RPC_URL
    : (cfg.CHAIN === "base-sepolia" ? cfg.BASE_SEPOLIA_RPC_URL : cfg.BASE_RPC_URL);
  if (!url || !url.trim()) {
    throw new Error("RPC URL missing. Set RPC_URL or the selected chain RPC URL.");
  }
  return url;
}

export function deploymentFileForChain(cfg: AppConfig): string {
  return cfg.CHAIN === "base-sepolia" ? "baseSepolia.json" : "base.json";
}


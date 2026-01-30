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

  // LLM
  OPENAI_API_KEY: z.string().optional()
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

export function loadConfig(): AppConfig {
  const cfg = envSchema.parse(process.env);

  // Enforce “private_key required by default” without blocking CDP experimentation.
  if (cfg.WALLET_MODE === "private_key" && !cfg.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required when WALLET_MODE=private_key");
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


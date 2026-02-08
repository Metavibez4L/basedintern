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
  .string()
  .trim()
  .pipe(z.enum(["true", "false"]))
  .transform((v) => v === "true");

const Chain = z.enum(["base-sepolia", "base"]);
const WalletMode = z.enum(["private_key", "cdp"]);
const SocialMode = z.enum(["none", "x_api", "moltbook", "multi"]);
const RouterType = z.enum(["unknown", "aerodrome", "uniswap-v3"]);
const NewsMode = z.enum(["event", "daily"]);
const MoltbookAuthMode = z.enum(["cookie", "apiKey", "bearer"]);

function parseCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function trimmedEnum(schema: z.ZodTypeAny) {
  return z.string().trim().pipe(schema);
}

const envSchemaBase = z.object({
  // Wallet
  WALLET_MODE: trimmedEnum(WalletMode).default("private_key"),
  PRIVATE_KEY: z.string().default(""),
  CDP_API_KEY_NAME: z.string().optional(),
  CDP_API_KEY_PRIVATE_KEY: z.string().optional(),

  // Multi-instance support (safe defaults)
  // Allows running multiple agents in parallel without clobbering state.json.
  STATE_PATH: z.string().trim().min(1).default("data/state.json"),

  // Optional override for scripts to persist to a different deployments file.
  // If unset, scripts use deployments/<network>.json
  DEPLOYMENTS_FILE: z.string().trim().optional(),

  // Network
  CHAIN: trimmedEnum(Chain).default("base-sepolia"),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  BASE_RPC_URL: z.string().optional(),
  RPC_URL: z.string().optional(),
  TOKEN_ADDRESS: z.string().optional(),

  // ERC-8004 (optional)
  ERC8004_ENABLED: BoolFromString.default("false"),
  ERC8004_IDENTITY_REGISTRY: z.string().optional(),
  ERC8004_AGENT_ID: z.string().optional(), // uint256 as decimal string
  ERC8004_AGENT_URI: z.string().optional(),

  // Agent runtime
  LOOP_MINUTES: z.coerce.number().int().positive().default(30),
  DRY_RUN: BoolFromString.default("true"),
  TRADING_ENABLED: BoolFromString.default("false"),
  KILL_SWITCH: BoolFromString.default("true"),

  // Optional control server (for remote ops via OpenClaw Gateway)
  CONTROL_ENABLED: BoolFromString.default("false"),
  CONTROL_BIND: z.string().trim().min(1).default("0.0.0.0"),
  CONTROL_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CONTROL_TOKEN: z.string().optional(),

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
  ROUTER_TYPE: trimmedEnum(RouterType).default("unknown"),
  ROUTER_ADDRESS: z.string().optional(),
  POOL_ADDRESS: z.string().optional(),

  // Aerodrome-specific
  AERODROME_STABLE: BoolFromString.default("false"), // true = stable pair, false = volatile
  AERODROME_GAUGE_ADDRESS: z.string().optional(),

  // =========================
  // Liquidity Provision (LP)
  // NOTE: kept optional in type so tests/mocks don't need updating.
  // Runtime defaults are applied in loadConfig().
  // =========================
  LP_ENABLED: BoolFromString.optional(), // Master switch for LP operations (default: false)
  LP_MAX_ETH_PER_ADD: z.string().optional(), // Max ETH to pair per LP add (default: "0.001")
  LP_MAX_TOKEN_FRACTION_BPS: z.coerce.number().int().min(0).max(10_000).optional(), // Max % of INTERN (default: 1000 = 10%)
  LP_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(10_000).optional(), // Slippage tolerance (default: 500 = 5%)
  USDC_ADDRESS: z.string().optional(), // USDC on Base (default: 0x833589...)
  POOL_ADDRESS_USDC: z.string().optional(), // INTERN/USDC pool (optional, can be queried)
  POOL_ADDRESS_USDC_STABLE: BoolFromString.optional(), // USDC pool type (default: false)
  GAUGE_ADDRESS_WETH: z.string().optional(), // Gauge for INTERN/WETH pool
  GAUGE_ADDRESS_USDC: z.string().optional(), // Gauge for INTERN/USDC pool

  // Social posting
  SOCIAL_MODE: trimmedEnum(SocialMode).default("none"),
  // Used only when SOCIAL_MODE=multi. Comma-separated list of targets.
  // Example: "x_api,moltbook"
  SOCIAL_MULTI_TARGETS: z.string().trim().default("x_api,moltbook"),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),

  // Moltbook (optional social mode)
  MOLTBOOK_ENABLED: BoolFromString.default("false"),
  // From Moltbook skill spec: https://www.moltbook.com/api/v1
  MOLTBOOK_BASE_URL: z.string().trim().min(1).default("https://www.moltbook.com/api/v1"),
  MOLTBOOK_AUTH_MODE: trimmedEnum(MoltbookAuthMode).default("bearer"),
  // Optional env-based key. CLI can also persist this into session.json.
  MOLTBOOK_API_KEY: z.string().optional(),
  MOLTBOOK_COOKIE_PATH: z.string().trim().min(1).default("data/moltbook/cookies.json"),
  MOLTBOOK_SESSION_PATH: z.string().trim().min(1).default("data/moltbook/session.json"),
  MOLTBOOK_USER_AGENT: z.string().trim().min(1).default("BasedIntern/1.0"),

  // X Phase 1 mentions poller (intent recognition, no execution)
  X_PHASE1_MENTIONS: BoolFromString.default("false"), // Enable mention polling + intent replies
  X_POLL_MINUTES: z.coerce.number().int().min(1).default(2), // How often to poll mentions (minutes)

  // Moltbook comment replies (AI-powered engagement)
  MOLTBOOK_REPLY_TO_COMMENTS: BoolFromString.default("false"), // Enable auto-reply to comments
  MOLTBOOK_REPLY_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(30), // How often to check for new comments

  // LLM
  OPENAI_API_KEY: z.string().optional(),

  // =========================
  // Base News Brain (optional)
  // =========================
  NEWS_ENABLED: BoolFromString.default("false"),
  NEWS_MODE: trimmedEnum(NewsMode).default("event"),
  // Back-compat names (existing)
  NEWS_MAX_POSTS_PER_DAY: z.coerce.number().int().positive().default(2),
  NEWS_MIN_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(120),

  // Requested names (aliases)
  NEWS_POSTS_PER_DAY: z.coerce.number().int().positive().optional(),
  NEWS_INTERVAL_MINUTES: z.coerce.number().int().min(1).optional(),

  NEWS_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  NEWS_REQUIRE_LINK: BoolFromString.default("true"),
  NEWS_REQUIRE_SOURCE_WHITELIST: BoolFromString.default("true"),
  // Primary news source is @base/@buildonbase/@openclaw X timelines (auto-enabled with X API creds)
  // GitHub feeds and DeFiLlama removed
  NEWS_SOURCES: z.string().default(""),
  // Legacy fields kept as optional for backward compat (not used by aggregator)
  NEWS_FEEDS: z.string().optional(),
  NEWS_GITHUB_FEEDS: z.string().optional(),
  NEWS_DAILY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(15),
  NEWS_MAX_ITEMS_CONTEXT: z.coerce.number().int().min(1).max(50).default(8),

  // Opinion generation
  NEWS_FETCH_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  NEWS_MIN_RELEVANCE_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  NEWS_CRYPTO_PANIC_KEY: z.string().optional(),
  // RSS removed — @base X timeline is now the primary news source
  // Legacy field kept as optional for backward compat
  NEWS_RSS_FEEDS: z.string().optional().transform((s) => s?.split(",").map((u) => u.trim()).filter(Boolean) || []),

  // HTTP fetch tuning (Railway-friendly)
  // NOTE: kept optional in type so tests/mocks don't need updating.
  // Runtime defaults are applied in loadConfig().
  NEWS_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  NEWS_HTTP_RETRIES: z.coerce.number().int().min(0).max(10).optional(),

  // Opinion circuit breaker tuning
  // NOTE: kept optional in type so tests/mocks don't need updating.
  // Runtime defaults are applied in loadConfig().
  NEWS_OPINION_CIRCUIT_BREAKER_FAILS: z.coerce.number().int().min(1).max(10).optional(),
  NEWS_OPINION_CIRCUIT_BREAKER_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),

  // Source-level cooldown: hours before the same news domain can be used again (default 4h)
  NEWS_SOURCE_COOLDOWN_HOURS: z.coerce.number().min(0).max(48).default(4),
});

const envSchema = envSchemaBase.superRefine((cfg, ctx) => {
  // Control server requirements
  if (cfg.CONTROL_ENABLED) {
    if (!cfg.CONTROL_TOKEN || cfg.CONTROL_TOKEN.trim().length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONTROL_TOKEN"],
        message: "CONTROL_TOKEN (>= 16 chars) is required when CONTROL_ENABLED=true"
      });
    }
  }

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
  const targets: string[] =
    cfg.SOCIAL_MODE === "multi" ? parseCsv(cfg.SOCIAL_MULTI_TARGETS) : [cfg.SOCIAL_MODE];

  if (cfg.SOCIAL_MODE === "multi" && targets.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SOCIAL_MULTI_TARGETS"],
      message: "SOCIAL_MULTI_TARGETS must list at least one target when SOCIAL_MODE=multi"
    });
  }

  for (const t of targets) {
    if (t === "x_api") {
      const req = (key: "X_API_KEY" | "X_API_SECRET" | "X_ACCESS_TOKEN" | "X_ACCESS_SECRET") => {
        const v = cfg[key];
        if (!v || !v.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SOCIAL_MODE includes x_api`
          });
        }
      };
      req("X_API_KEY");
      req("X_API_SECRET");
      req("X_ACCESS_TOKEN");
      req("X_ACCESS_SECRET");
    }

    if (t === "moltbook") {
      // In multi-mode, moltbook can be listed but disabled via MOLTBOOK_ENABLED=false.
      // We only require Moltbook enablement when SOCIAL_MODE=moltbook.
      const moltbookRequired = cfg.SOCIAL_MODE === "moltbook";
      const moltbookEnabled = cfg.MOLTBOOK_ENABLED;

      if (moltbookRequired && !moltbookEnabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MOLTBOOK_ENABLED"],
          message: "MOLTBOOK_ENABLED must be true when SOCIAL_MODE=moltbook"
        });
      }

      if (moltbookEnabled) {
        // The Moltbook spec explicitly warns that redirects can strip Authorization headers.
        // Enforce canonical `www.moltbook.com` to reduce accidental token leakage.
        try {
          const u = new URL(cfg.MOLTBOOK_BASE_URL);
          if (u.protocol !== "https:") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["MOLTBOOK_BASE_URL"],
              message: "MOLTBOOK_BASE_URL must use https"
            });
          }
          if (u.hostname !== "www.moltbook.com") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["MOLTBOOK_BASE_URL"],
              message: "MOLTBOOK_BASE_URL must use www.moltbook.com (the skill spec warns redirects can strip Authorization)"
            });
          }
          if (!u.pathname.startsWith("/api/v1")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["MOLTBOOK_BASE_URL"],
              message: "MOLTBOOK_BASE_URL should point at /api/v1"
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["MOLTBOOK_BASE_URL"],
            message: "MOLTBOOK_BASE_URL must be a valid URL"
          });
        }
      }
    }

    if (t !== "none" && t !== "x_api" && t !== "moltbook" && t !== "multi") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SOCIAL_MULTI_TARGETS"],
        message: `unknown SOCIAL_MULTI_TARGETS entry: ${t}`
      });
    }
  }

  // ERC-8004 requirements
  if (cfg.ERC8004_ENABLED) {
    if (!cfg.ERC8004_IDENTITY_REGISTRY || !cfg.ERC8004_IDENTITY_REGISTRY.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ERC8004_IDENTITY_REGISTRY"],
        message: "ERC8004_IDENTITY_REGISTRY is required when ERC8004_ENABLED=true"
      });
    }
    if (!cfg.ERC8004_AGENT_ID || !cfg.ERC8004_AGENT_ID.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ERC8004_AGENT_ID"],
        message: "ERC8004_AGENT_ID is required when ERC8004_ENABLED=true"
      });
    } else if (!/^\d+$/.test(cfg.ERC8004_AGENT_ID.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ERC8004_AGENT_ID"],
        message: "ERC8004_AGENT_ID must be a uint256 decimal string"
      });
    }
  }
});

export type Erc8004Config = {
  enabled: boolean;
  chainId: number;
  identityRegistry?: string;
  agentId?: bigint;
  agentUri?: string;
  agentRegistryId?: string;
  agentRef?: string;
};

export type AppConfig = z.infer<typeof envSchema>;

export type ResolvedConfig = AppConfig & { erc8004: Erc8004Config };

function chainIdFor(chain: AppConfig["CHAIN"]): number {
  return chain === "base" ? 8453 : 84532;
}

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
  const targets = cfg.SOCIAL_MODE === "multi" ? parseCsv(cfg.SOCIAL_MULTI_TARGETS) : [cfg.SOCIAL_MODE];
  if (cfg.SOCIAL_MODE === "multi" && targets.length === 0) {
    errors.push("SOCIAL_MULTI_TARGETS must list at least one target when SOCIAL_MODE=multi");
  }

  if (targets.includes("moltbook")) {
    if (cfg.SOCIAL_MODE === "moltbook" && !cfg.MOLTBOOK_ENABLED) {
      errors.push("MOLTBOOK_ENABLED must be true when SOCIAL_MODE=moltbook");
    }

    if (cfg.MOLTBOOK_ENABLED) {
      try {
        const u = new URL(cfg.MOLTBOOK_BASE_URL);
        if (u.protocol !== "https:") errors.push("MOLTBOOK_BASE_URL must use https");
        if (u.hostname !== "www.moltbook.com") {
          errors.push("MOLTBOOK_BASE_URL must use www.moltbook.com (redirects can strip Authorization)");
        }
        if (!u.pathname.startsWith("/api/v1")) errors.push("MOLTBOOK_BASE_URL should point at /api/v1");
      } catch {
        errors.push("MOLTBOOK_BASE_URL must be a valid URL");
      }
    }
  }

  // =========================
  // LP guardrails
  // =========================
  if (cfg.LP_ENABLED) {
    if (!cfg.TRADING_ENABLED) {
      errors.push("TRADING_ENABLED must be true when LP_ENABLED=true (LP uses the same wallet/router)");
    }
    const lpMaxEth = cfg.LP_MAX_ETH_PER_ADD ?? "0.001";
    const lpSpend = parseFloat(lpMaxEth);
    if (isNaN(lpSpend) || lpSpend <= 0) {
      errors.push(`LP_MAX_ETH_PER_ADD must be a positive decimal: ${lpMaxEth}`);
    }
  }

  // =========================
  // News Brain guardrails
  // =========================
  if (cfg.NEWS_ENABLED) {
    // Apply alias overrides if present
    const postsPerDay = cfg.NEWS_POSTS_PER_DAY ?? cfg.NEWS_MAX_POSTS_PER_DAY;
    const intervalMinutes = cfg.NEWS_INTERVAL_MINUTES ?? cfg.NEWS_MIN_INTERVAL_MINUTES;

    const canPostNewsToX =
      cfg.SOCIAL_MODE === "x_api" ||
      cfg.SOCIAL_MODE === "none" ||
      (cfg.SOCIAL_MODE === "multi" && parseCsv(cfg.SOCIAL_MULTI_TARGETS).includes("x_api"));

    if (!canPostNewsToX) {
      errors.push("When NEWS_ENABLED=true, SOCIAL_MODE must be x_api, multi (including x_api), or none");
    }
    if (postsPerDay <= 0) {
      errors.push("NEWS_MAX_POSTS_PER_DAY must be > 0 when NEWS_ENABLED=true");
    }
    if (intervalMinutes < 1) {
      errors.push("NEWS_MIN_INTERVAL_MINUTES must be >= 1 when NEWS_ENABLED=true");
    }

    // NEWS_GITHUB_FEEDS has safe default (proper .atom URLs), no strict validation needed

    if (cfg.NEWS_MODE === "daily") {
      // Zod already constrains this, but keep a clear guardrail error for operators.
      if (cfg.NEWS_DAILY_HOUR_UTC < 0 || cfg.NEWS_DAILY_HOUR_UTC > 23) {
        errors.push("NEWS_DAILY_HOUR_UTC must be an integer 0-23 when NEWS_MODE=daily");
      }
    }
  }

  return errors;
}

export function loadConfig(): ResolvedConfig {
  const baseCfg = envSchema.parse(process.env);

  // Apply safe defaults for optional tuning knobs.
  // These are optional in the AppConfig type so tests/mocks can omit them.
  (baseCfg as any).NEWS_HTTP_TIMEOUT_MS = baseCfg.NEWS_HTTP_TIMEOUT_MS ?? 15000;
  (baseCfg as any).NEWS_HTTP_RETRIES = baseCfg.NEWS_HTTP_RETRIES ?? 2;
  (baseCfg as any).NEWS_OPINION_CIRCUIT_BREAKER_FAILS = baseCfg.NEWS_OPINION_CIRCUIT_BREAKER_FAILS ?? 3;
  (baseCfg as any).NEWS_OPINION_CIRCUIT_BREAKER_MINUTES = baseCfg.NEWS_OPINION_CIRCUIT_BREAKER_MINUTES ?? 30;

  // Apply LP defaults
  (baseCfg as any).LP_ENABLED = baseCfg.LP_ENABLED ?? false;
  (baseCfg as any).LP_MAX_ETH_PER_ADD = baseCfg.LP_MAX_ETH_PER_ADD ?? "0.001";
  (baseCfg as any).LP_MAX_TOKEN_FRACTION_BPS = baseCfg.LP_MAX_TOKEN_FRACTION_BPS ?? 1000;
  (baseCfg as any).LP_SLIPPAGE_BPS = baseCfg.LP_SLIPPAGE_BPS ?? 500;
  (baseCfg as any).USDC_ADDRESS = baseCfg.USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  (baseCfg as any).POOL_ADDRESS_USDC_STABLE = baseCfg.POOL_ADDRESS_USDC_STABLE ?? false;

  // Apply News Brain alias env vars (requested names) onto the existing names.
  // This keeps the rest of the codebase stable while supporting both.
  if (baseCfg.NEWS_POSTS_PER_DAY !== undefined && baseCfg.NEWS_POSTS_PER_DAY !== null) {
    (baseCfg as any).NEWS_MAX_POSTS_PER_DAY = baseCfg.NEWS_POSTS_PER_DAY;
  }
  if (baseCfg.NEWS_INTERVAL_MINUTES !== undefined && baseCfg.NEWS_INTERVAL_MINUTES !== null) {
    (baseCfg as any).NEWS_MIN_INTERVAL_MINUTES = baseCfg.NEWS_INTERVAL_MINUTES;
  }

  const chainId = chainIdFor(baseCfg.CHAIN);
  const identityRegistry = baseCfg.ERC8004_IDENTITY_REGISTRY?.trim() || undefined;
  const agentUri = baseCfg.ERC8004_AGENT_URI?.trim() || undefined;
  const agentId = baseCfg.ERC8004_AGENT_ID?.trim() ? BigInt(baseCfg.ERC8004_AGENT_ID.trim()) : undefined;
  const agentRegistryId = identityRegistry ? `eip155:${chainId}:${identityRegistry}` : undefined;
  const agentRef = agentRegistryId && agentId !== undefined ? `${agentRegistryId}#${agentId.toString()}` : undefined;

  const cfg: ResolvedConfig = {
    ...baseCfg,
    erc8004: {
      enabled: baseCfg.ERC8004_ENABLED,
      chainId,
      identityRegistry,
      agentId,
      agentUri,
      agentRegistryId,
      agentRef
    }
  };

  // Enforce "private_key required by default" without blocking CDP experimentation.
  if (cfg.WALLET_MODE === "private_key" && !cfg.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required when WALLET_MODE=private_key");
  }

  // Validate guardrails and trading consistency
  const guardErrors = validateGuardrails(baseCfg);
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

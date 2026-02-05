import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { createMoltbookClient } from "../social/moltbook/client.js";
import { redactToken, safeErrorMessage } from "../social/moltbook/redact.js";

function resolveFromCwd(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function loadMoltbookCliConfig(): AppConfig {
  // Minimal AppConfig shim for Moltbook CLI.
  // Avoids requiring wallet/RPC config just to manage Moltbook auth.
  const baseUrl = (process.env.MOLTBOOK_BASE_URL || "https://www.moltbook.com/api/v1").trim();
  const authMode = (process.env.MOLTBOOK_AUTH_MODE || "bearer").trim() as any;
  const cookiePath = (process.env.MOLTBOOK_COOKIE_PATH || "data/moltbook/cookies.json").trim();
  const sessionPath = (process.env.MOLTBOOK_SESSION_PATH || "data/moltbook/session.json").trim();
  const apiKey = (process.env.MOLTBOOK_API_KEY || "").trim();
  const userAgent = (process.env.MOLTBOOK_USER_AGENT || "BasedIntern/1.0").trim();
  const enabled = ((process.env.MOLTBOOK_ENABLED || "false").trim().toLowerCase() === "true") as any;

  return {
    // Moltbook-specific
    MOLTBOOK_ENABLED: enabled,
    MOLTBOOK_BASE_URL: baseUrl,
    MOLTBOOK_AUTH_MODE: authMode,
    MOLTBOOK_API_KEY: apiKey || undefined,
    MOLTBOOK_COOKIE_PATH: cookiePath,
    MOLTBOOK_SESSION_PATH: sessionPath,
    MOLTBOOK_USER_AGENT: userAgent,

    // Unused by this CLI but required by the type.
    // Keep safe placeholders; nothing here is used.
    WALLET_MODE: "cdp",
    PRIVATE_KEY: "",
    CDP_API_KEY_NAME: undefined,
    CDP_API_KEY_PRIVATE_KEY: undefined,
    STATE_PATH: "data/state.json",
    DEPLOYMENTS_FILE: undefined,

    CHAIN: "base-sepolia",
    BASE_SEPOLIA_RPC_URL: undefined,
    BASE_RPC_URL: undefined,
    RPC_URL: undefined,
    TOKEN_ADDRESS: undefined,

    ERC8004_ENABLED: false,
    ERC8004_IDENTITY_REGISTRY: undefined,
    ERC8004_AGENT_ID: undefined,
    ERC8004_AGENT_URI: undefined,

    LOOP_MINUTES: 30,
    DRY_RUN: true,
    TRADING_ENABLED: false,
    KILL_SWITCH: true,

    DAILY_TRADE_CAP: 0,
    MIN_INTERVAL_MINUTES: 60,
    MAX_SPEND_ETH_PER_TRADE: "0",
    SELL_FRACTION_BPS: 0,
    SLIPPAGE_BPS: 0,

    APPROVE_MAX: false,
    APPROVE_CONFIRMATIONS: 1,

    WETH_ADDRESS: undefined,
    ROUTER_TYPE: "unknown",
    ROUTER_ADDRESS: undefined,
    POOL_ADDRESS: undefined,

    AERODROME_STABLE: false,
    AERODROME_GAUGE_ADDRESS: undefined,

    SOCIAL_MODE: "none",
    X_API_KEY: undefined,
    X_API_SECRET: undefined,
    X_ACCESS_TOKEN: undefined,
    X_ACCESS_SECRET: undefined,

    X_PHASE1_MENTIONS: false,
    X_POLL_MINUTES: 2,

    OPENAI_API_KEY: undefined,

    NEWS_ENABLED: false,
    NEWS_MODE: "event",
    NEWS_MAX_POSTS_PER_DAY: 2,
    NEWS_MIN_INTERVAL_MINUTES: 120,
    NEWS_POSTS_PER_DAY: undefined,
    NEWS_INTERVAL_MINUTES: undefined,
    NEWS_MIN_SCORE: 0.5,
    NEWS_FEEDS: "",
    NEWS_GITHUB_FEEDS: "",
    NEWS_REQUIRE_LINK: true,
    NEWS_REQUIRE_SOURCE_WHITELIST: true,
    NEWS_SOURCES: "defillama,github,rss",
    NEWS_DAILY_HOUR_UTC: 15,
    NEWS_MAX_ITEMS_CONTEXT: 8
  } as any;
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
}

async function cmdDoctor(): Promise<void> {
  const cfg = loadMoltbookCliConfig();
  const client = createMoltbookClient(cfg);
  const me = await client.whoami();
  const name = me?.agent?.name || me?.name;
  logger.info("moltbook.doctor ok", { name: typeof name === "string" ? name : undefined });
}

async function cmdStatus(): Promise<void> {
  const cfg = loadMoltbookCliConfig();
  const client = createMoltbookClient(cfg);
  const res = await client.getStatus();
  const status = res?.status;
  logger.info("moltbook.status", { status: typeof status === "string" ? status : undefined });
}

async function cmdClaim(): Promise<void> {
  const cfg = loadMoltbookCliConfig();
  const sessionPath = resolveFromCwd(cfg.MOLTBOOK_SESSION_PATH);
  const raw = await readFile(sessionPath, "utf8");
  const session = JSON.parse(raw) as any;

  const claimUrl = session?.claim_url || session?.claimUrl;
  const verificationCode = session?.verification_code || session?.verificationCode;
  const agentName = session?.agent_name || session?.agentName;

  logger.info("moltbook.claim", {
    agentName: typeof agentName === "string" ? agentName : undefined,
    claimUrl: typeof claimUrl === "string" ? claimUrl : undefined,
    verificationCode: typeof verificationCode === "string" ? verificationCode : undefined,
    sessionPath
  });
}

function defaultAgentName(): string {
  // Avoid collisions by default; operators can override via env/args.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `BasedIntern_${suffix}`;
}

async function cmdRegister(nameArg?: string, descriptionArg?: string): Promise<void> {
  const cfg = loadMoltbookCliConfig();
  const client = createMoltbookClient(cfg);

  const name = (nameArg || process.env.MOLTBOOK_AGENT_NAME || "").trim() || defaultAgentName();
  const description = (descriptionArg || process.env.MOLTBOOK_AGENT_DESCRIPTION || "").trim() || "Based Intern autonomous agent";

  const res = await client.registerAgent({ name, description });
  const apiKey = res?.agent?.api_key;
  const claimUrl = res?.agent?.claim_url;
  const verificationCode = res?.agent?.verification_code;

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("register response missing agent.api_key");
  }

  // Persist key + claim details to disk (never print raw key).
  await client.saveRegistration({
    apiKey,
    agentName: name,
    claimUrl: typeof claimUrl === "string" ? claimUrl : undefined,
    verificationCode: typeof verificationCode === "string" ? verificationCode : undefined
  });

  logger.info("moltbook.registered", {
    agentName: name,
    claimUrl: typeof claimUrl === "string" ? claimUrl : undefined,
    verificationCode: typeof verificationCode === "string" ? verificationCode : undefined,
    sessionPath: cfg.MOLTBOOK_SESSION_PATH,
    apiKey: redactToken(apiKey)
  });
}

async function cmdImportCookie(filePath: string | undefined): Promise<void> {
  if (!filePath) throw new Error("usage: import-cookie <path>");

  const cfg = loadMoltbookCliConfig();
  const src = resolveFromCwd(filePath);
  const dst = resolveFromCwd(cfg.MOLTBOOK_COOKIE_PATH);

  // Validate readable JSON (supports either {cookie} or {cookies:[...]})
  const raw = await readFile(src, "utf8");
  JSON.parse(raw);

  await ensureDir(dst);
  await copyFile(src, dst);

  logger.info("moltbook.import-cookie copied", { from: src, to: dst });
}

async function cmdSetKey(): Promise<void> {
  const cfg = loadMoltbookCliConfig();
  const key = (process.env.MOLTBOOK_API_KEY || "").trim();
  if (!key) throw new Error("MOLTBOOK_API_KEY env var is required for set-key");

  const client = createMoltbookClient(cfg);
  await client.saveRegistration({ apiKey: key });

  logger.info("moltbook.set-key saved", {
    sessionPath: cfg.MOLTBOOK_SESSION_PATH,
    apiKey: redactToken(key)
  });
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Usage:",
        "  tsx src/cli/moltbook.ts doctor",
        "  tsx src/cli/moltbook.ts status",
        "  tsx src/cli/moltbook.ts claim  # prints saved claim URL/code if available",
        "  tsx src/cli/moltbook.ts register [name] [description]",
        "  tsx src/cli/moltbook.ts import-cookie <path>",
        "  tsx src/cli/moltbook.ts set-key  # reads MOLTBOOK_API_KEY env var"
      ].join("\n")
    );
    return;
  }

  if (command === "doctor") return await cmdDoctor();
  if (command === "status") return await cmdStatus();
  if (command === "claim") return await cmdClaim();
  if (command === "register") return await cmdRegister(rest[0], rest.slice(1).join(" "));
  if (command === "import-cookie") return await cmdImportCookie(rest[0]);
  if (command === "set-key") return await cmdSetKey();

  throw new Error(`unknown command: ${command}`);
}

main().catch((err) => {
  logger.error("moltbook.cli failed", { error: safeErrorMessage(err) });
  process.exit(1);
});

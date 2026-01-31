import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Address } from "viem";
import { loadConfig, deploymentFileForChain } from "./config.js";
import { logger } from "./logger.js";
import { createChainClients } from "./chain/client.js";
import { readEthBalance, readErc20Balance, readErc20Decimals } from "./chain/erc20.js";
import { readBestEffortPrice } from "./chain/price.js";
import { proposeAction } from "./agent/brain.js";
import { generateNewsTweet } from "./agent/brain.js";
import { enforceGuardrails } from "./agent/decision.js";
import { buildReceiptMessage } from "./agent/receipts.js";
import { loadState, recordExecutedTrade, recordNewsPosted, saveState } from "./agent/state.js";
import { watchForActivity, parseMinEthDelta, parseMinTokenDelta, type ActivityWatchContext } from "./agent/watch.js";
import { createPoster } from "./social/poster.js";
import { createTradeExecutor } from "./chain/trade.js";
import { pollMentionsAndRespond, type MentionPollerContext } from "./social/x_mentions.js";
import { buildNewsPlan } from "./news/news.js";
import { postNewsTweet } from "./social/news_poster.js";

async function resolveTokenAddress(cfg: ReturnType<typeof loadConfig>): Promise<Address | null> {
  if (cfg.TOKEN_ADDRESS) return cfg.TOKEN_ADDRESS as Address;

  const fileName = deploymentFileForChain(cfg);
  const p = path.join(process.cwd(), "deployments", fileName);
  try {
    const raw = await readFile(p, "utf8");
    const json = JSON.parse(raw) as { token?: string };
    if (json.token) return json.token as Address;
  } catch {
    // ignore
  }
  return null;
}

async function tick(): Promise<void> {
  const cfg = loadConfig();
  await bootstrapCookiesIfConfigured(cfg);
  const clients = createChainClients(cfg);

  const now = new Date();
  const state = await loadState();

  // ============================================================
  // PHASE 1: X MENTIONS POLLER (Intent Recognition, No Execution)
  // ============================================================
  // Poll mentions at X_POLL_MINUTES interval if enabled
  if (cfg.X_PHASE1_MENTIONS && cfg.SOCIAL_MODE === "x_api") {
    const lastPollMs = state.lastSuccessfulMentionPollMs ?? 0;
    const pollIntervalMs = cfg.X_POLL_MINUTES * 60 * 1000;
    const timeSinceLastPoll = Date.now() - lastPollMs;

    if (timeSinceLastPoll >= pollIntervalMs) {
      try {
        const mentionCtx: MentionPollerContext = {
          cfg,
          state,
          saveStateFn: saveState
        };
        await pollMentionsAndRespond(mentionCtx);
      } catch (err) {
        logger.warn("x_mentions poller error", {
          error: err instanceof Error ? err.message : String(err)
        });
        // Continue with normal loop even if mention polling fails
      }
    }
  }

  const poster = createPoster(cfg, state);

  let tokenAddress: Address | null = null;
  try {
    tokenAddress = await resolveTokenAddress(cfg);
  } catch (err) {
    logger.warn("failed to resolve token address", { error: err instanceof Error ? err.message : String(err) });
  }

  const wallet = clients.walletAddress;
  let ethWei = 0n;
  try {
    ethWei = await readEthBalance(clients, wallet);
  } catch (err) {
    logger.warn("failed to read ETH balance; using 0", { error: err instanceof Error ? err.message : String(err) });
  }

  let internDecimals = 18;
  let internAmount = 0n;
  if (tokenAddress) {
    try {
      internDecimals = await readErc20Decimals(clients, tokenAddress);
      internAmount = await readErc20Balance(clients, tokenAddress, wallet);
    } catch (err) {
      logger.warn("failed to read INTERN balance/decimals", { error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.warn(
      "TOKEN_ADDRESS not set and deployments json missing; INTERN balance set to 0. " +
        "Fix: set TOKEN_ADDRESS env var (recommended for Railway) or provide deployments/<network>.json at runtime.",
      {}
    );
  }

  let price = { text: null as string | null, source: "unknown" };
  if (tokenAddress) {
    try {
      price = await readBestEffortPrice(cfg, clients, tokenAddress);
    } catch (err) {
      logger.warn("failed to read price; using unknown", { error: err instanceof Error ? err.message : String(err) });
      price = { text: null, source: "unknown" };
    }
  }

  // ============================================================
  // NEW: ACTIVITY DETECTION
  // ============================================================
  const minEthDelta = parseMinEthDelta(process.env.MIN_ETH_DELTA ?? "0.00001");
  const minTokenDelta = parseMinTokenDelta(
    process.env.MIN_TOKEN_DELTA ?? "1000",
    internDecimals
  );

  const watchCtx: ActivityWatchContext = {
    chain: cfg.CHAIN,
    publicClient: clients.publicClient as any,
    walletAddress: wallet,
    tokenAddress,
    decimals: internDecimals,
    minEthDeltaWei: minEthDelta,
    minTokenDeltaRaw: minTokenDelta
  };

  const activityResult = await watchForActivity(
    watchCtx,
    state.lastSeenNonce,
    state.lastSeenEthWei,
    state.lastSeenTokenRaw,
    state.lastSeenBlockNumber
  );

  // Always update watcher state (even if no activity)
  const nextState = {
    ...state,
    lastSeenNonce: activityResult.newStatePatch.lastSeenNonce ?? state.lastSeenNonce,
    lastSeenEthWei: activityResult.newStatePatch.lastSeenEthWei ?? state.lastSeenEthWei,
    lastSeenTokenRaw: activityResult.newStatePatch.lastSeenTokenRaw ?? state.lastSeenTokenRaw,
    lastSeenBlockNumber: activityResult.newStatePatch.lastSeenBlockNumber ?? state.lastSeenBlockNumber
  };

  // Check if we should post: activity detected OR heartbeat
  const shouldPost = activityResult.changed;
  // TODO: Optional heartbeat logic: check if no posts today and post 1/day

  let workingState = nextState;

  if (!shouldPost) {
    logger.info("no activity detected, skipping receipt post", {
      minEthDelta: minEthDelta.toString(),
      minTokenDelta: minTokenDelta.toString()
    });
    // Still save updated watcher state
    await saveState(workingState);
  } else {
    logger.info("activity detected, posting receipt", {
      reasons: activityResult.reasons
    });

    // ============================================================
    // PROPOSE & EXECUTE (existing logic, unchanged)
    // ============================================================
    const proposal = await proposeAction(cfg, {
      wallet,
      ethWei,
      internAmount,
      internDecimals,
      priceText: price.text
    });

    const decision = enforceGuardrails(proposal, {
      cfg,
      state: workingState,
      now,
      wallet,
      ethWei,
      internAmount
    });

    let txHash: `0x${string}` | null = null;
    if (decision.shouldExecute && tokenAddress) {
      try {
        const trader = createTradeExecutor(cfg, clients, tokenAddress);
        if (decision.action === "BUY" && decision.buySpendWei) {
          txHash = await trader.executeBuy(decision.buySpendWei);
          workingState = await recordExecutedTrade(workingState, now);
        } else if (decision.action === "SELL" && decision.sellAmount) {
          txHash = await trader.executeSell(decision.sellAmount);
          workingState = await recordExecutedTrade(workingState, now);
        }
      } catch (err) {
        logger.warn("trade execution failed; falling back to HOLD receipt", {
          error: err instanceof Error ? err.message : String(err)
        });
        txHash = null;
      }
    }

    const receipt = buildReceiptMessage({
      action: decision.action,
      agentRef: cfg.erc8004.enabled ? (cfg.erc8004.agentRef ?? null) : null,
      wallet,
      ethWei,
      internAmount,
      internDecimals,
      priceText: price.text,
      txHash,
      dryRun: cfg.DRY_RUN
    });

    // Post (or log) receipt.
    await poster.post(receipt);

    // Update state with new day marker
    const postDay = utcDayKey(now);
    workingState.lastPostDayUtc = postDay;
    await saveState(workingState);

    // Always show guardrail block reasons in logs for operator visibility.
    if (decision.blockedReason) {
      logger.info("guardrails blocked trade", { blockedReason: decision.blockedReason });
    }
  }

  // ============================================================
  // Base News Brain (non-blocking)
  // ============================================================
  try {
    const { plan, items, unseenItems } = await buildNewsPlan({ cfg, state: workingState, now });

    if (!plan.shouldPost || !plan.item) {
      logger.info("news.skip", {
        reasons: plan.reasons,
        items: items.length,
        unseen: unseenItems.length
      });
      return;
    }

    logger.info("news.post", {
      reasons: plan.reasons,
      source: plan.item.source,
      url: plan.item.url
    });

    const tweet = await generateNewsTweet(cfg, {
      items,
      chosenItem: plan.item,
      now
    });

    // Hard safety: enforce source URL
    if (cfg.NEWS_REQUIRE_LINK && !tweet.includes(plan.item.url)) {
      logger.warn("news.skip (tweet missing required url)", {
        url: plan.item.url
      });
      return;
    }

    const postRes = await postNewsTweet(cfg, workingState, saveState, tweet);
    workingState = postRes.state;

    if (!postRes.posted) {
      logger.info("news.skip", {
        reasons: [...plan.reasons, postRes.reason ?? "not posted"],
        source: plan.item.source
      });
      return;
    }

    workingState = await recordNewsPosted(workingState, now, plan.item.id);
  } catch (err) {
    logger.warn("news pipeline error", { error: err instanceof Error ? err.message : String(err) });
  }
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function bootstrapCookiesIfConfigured(cfg: ReturnType<typeof loadConfig>): Promise<void> {
  if (!cfg.X_COOKIES_B64 || !cfg.X_COOKIES_PATH) return;

  const outPath = path.resolve(process.cwd(), cfg.X_COOKIES_PATH);
  try {
    // If file already exists, do nothing.
    await readFile(outPath, "utf8");
    return;
  } catch {
    // continue
  }

  const dir = path.dirname(outPath);
  await mkdir(dir, { recursive: true });
  const json = Buffer.from(cfg.X_COOKIES_B64, "base64").toString("utf8");
  await writeFile(outPath, json, "utf8");
  logger.info("wrote X cookies from env to file", { path: cfg.X_COOKIES_PATH });
}

async function main() {
  const cfg = loadConfig();
  logger.info("based-intern starting", {
    chain: cfg.CHAIN,
    socialMode: cfg.SOCIAL_MODE,
    dryRun: cfg.DRY_RUN,
    tradingEnabled: cfg.TRADING_ENABLED,
    killSwitch: cfg.KILL_SWITCH,
    loopMinutes: cfg.LOOP_MINUTES
  });

  while (true) {
    try {
      await tick();
    } catch (err) {
      logger.error("tick failed", { error: err instanceof Error ? err.message : String(err) });
    }
    await sleep(cfg.LOOP_MINUTES * 60_000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  logger.error("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});


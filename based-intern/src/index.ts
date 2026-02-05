import { readFile } from "node:fs/promises";
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
import { replyToMoltbookComments } from "./social/moltbook_comments.js";
import { postMoltbookDiscussion } from "./social/moltbook_discussions.js";
import { postOpenClawAnnouncementOnce } from "./social/openclaw_announcement.js";
import { buildNewsPlan } from "./news/news.js";
import { postNewsTweet } from "./social/news_poster.js";
import { startControlServer } from "./control/server.js";
import { NewsAggregator } from "./news/fetcher.js";
import { OpinionGenerator } from "./news/opinion.js";
import { NewsOpinionPoster } from "./news/opinionPoster.js";

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
  const clients = createChainClients(cfg);

  const now = new Date();
  const state = await loadState();

  // ============================================================
  // PHASE 1: X MENTIONS POLLER (Intent Recognition, No Execution)
  // ============================================================
  // Poll mentions at X_POLL_MINUTES interval if enabled
  const xApiEnabledForMentions =
    cfg.SOCIAL_MODE === "x_api" || (cfg.SOCIAL_MODE === "multi" && cfg.SOCIAL_MULTI_TARGETS.split(",").map((s) => s.trim()).includes("x_api"));

  if (cfg.X_PHASE1_MENTIONS && xApiEnabledForMentions) {
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

  // ============================================================
  // MOLTBOOK COMMENT REPLY SYSTEM
  // ============================================================
  // Reply to comments on agent's Moltbook posts (AI-powered engagement)
  const moltbookEnabledForReplies =
    cfg.MOLTBOOK_ENABLED &&
    (cfg.SOCIAL_MODE === "moltbook" || (cfg.SOCIAL_MODE === "multi" && cfg.SOCIAL_MULTI_TARGETS.split(",").map((s) => s.trim()).includes("moltbook")));

  if (cfg.MOLTBOOK_REPLY_TO_COMMENTS && moltbookEnabledForReplies) {
    const lastReplyCheckMs = state.moltbookLastReplyCheckMs ?? 0;
    const replyIntervalMs = cfg.MOLTBOOK_REPLY_INTERVAL_MINUTES * 60 * 1000;
    const timeSinceLastCheck = Date.now() - lastReplyCheckMs;

    if (timeSinceLastCheck >= replyIntervalMs) {
      try {
        logger.info("moltbook.reply.check_start");
        const result = await replyToMoltbookComments(cfg, state, saveState);
        
        // Update last check time in state (function will save it)
        logger.info("moltbook.reply.check_complete", result);
      } catch (err) {
        logger.warn("moltbook.reply.check_error", {
          error: err instanceof Error ? err.message : String(err)
        });
        // Continue with normal loop even if reply system fails
      }
    }
  }

  // ============================================================
  // MOLTBOOK PROACTIVE DISCUSSION POSTING (Viral Engagement)
  // ============================================================
  // Posts standalone discussion starters and community callouts to Moltbook
  const moltbookEnabledForDiscussions =
    cfg.MOLTBOOK_ENABLED &&
    (cfg.SOCIAL_MODE === "moltbook" || (cfg.SOCIAL_MODE === "multi" && cfg.SOCIAL_MULTI_TARGETS.split(",").map((s) => s.trim()).includes("moltbook")));

  if (moltbookEnabledForDiscussions) {
    try {
      const discussionResult = await postMoltbookDiscussion(cfg, state, saveState);

      if (discussionResult.result.posted) {
        logger.info("moltbook.discussion.posted_in_tick", {
          topic: discussionResult.result.topic,
          kind: discussionResult.result.kind
        });
      } else {
        logger.info("moltbook.discussion.skipped", {
          reason: discussionResult.result.reason
        });
      }
    } catch (err) {
      logger.warn("moltbook.discussion.error", {
        error: err instanceof Error ? err.message : String(err)
      });
      // Continue with normal loop even if discussion posting fails
    }
  }

  const poster = createPoster(cfg, state);

  // ============================================================
  // OPENCLAW ANNOUNCEMENT (one-time, runs on first tick only)
  // ============================================================
  try {
    const announcementResult = await postOpenClawAnnouncementOnce(cfg, state, saveState, poster);
    if (announcementResult.posted) {
      logger.info("openclaw.announcement.posted_successfully");
    }
  } catch (err) {
    logger.warn("openclaw.announcement.error", {
      error: err instanceof Error ? err.message : String(err)
    });
    // Continue with normal loop even if announcement fails
  }

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
  const postDay = utcDayKey(now);
  const heartbeatDue = nextState.lastPostDayUtc !== postDay;
  const shouldPost = activityResult.changed || heartbeatDue;

  let workingState = nextState;

  if (!shouldPost) {
    logger.info("no activity detected, skipping receipt post", {
      minEthDelta: minEthDelta.toString(),
      minTokenDelta: minTokenDelta.toString()
    });
    // Still save updated watcher state
    await saveState(workingState);
  } else if (!activityResult.changed && heartbeatDue) {
    logger.info("heartbeat due, posting receipt", {
      postDay,
      lastPostDayUtc: workingState.lastPostDayUtc
    });

    const receipt = buildReceiptMessage({
      action: "HOLD",
      agentRef: cfg.erc8004.enabled ? (cfg.erc8004.agentRef ?? null) : null,
      wallet,
      ethWei,
      internAmount,
      internDecimals,
      priceText: price.text,
      txHash: null,
      dryRun: cfg.DRY_RUN
    });

    await poster.post(receipt);

    workingState.lastPostDayUtc = postDay;
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
      // non-blocking: allow other pipelines to run
    }

    if (plan.shouldPost && plan.item) {
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
      } else {
        const postRes = await postNewsTweet(cfg, workingState, saveState, tweet);
        workingState = postRes.state;

        if (!postRes.posted) {
          logger.info("news.skip", {
            reasons: [...plan.reasons, postRes.reason ?? "not posted"],
            source: plan.item.source
          });
        } else {
          workingState = await recordNewsPosted(workingState, now, plan.item.id);
        }
      }
    }

  } catch (err) {
    logger.warn("news pipeline error", { error: err instanceof Error ? err.message : String(err) });
  }

  // ============================================================
  // NEW: NEWS OPINION CYCLE (separate from Base News Brain)
  // ============================================================
  if (cfg.NEWS_ENABLED && cfg.OPENAI_API_KEY) {
    const nowMs = Date.now();

    // Circuit breaker: temporarily disable on repeated failures
    const disabledUntil = workingState.newsOpinionCircuitBreakerDisabledUntilMs ?? null;
    if (disabledUntil && nowMs < disabledUntil) {
      logger.info("news.opinion.skip.circuit_open", { disabledUntil });
    } else {
      // Attempt gating: use lastAttempt (not lastSuccess) to prevent thrash on failures
      const lastAttemptMs = workingState.newsOpinionLastAttemptMs ?? 0;
      const intervalMs = cfg.NEWS_FETCH_INTERVAL_MINUTES * 60 * 1000;
      const shouldAttempt = nowMs - lastAttemptMs >= intervalMs;

      const dailyOpinionCount = workingState.newsOpinionPostsToday || 0;
      const canPostMore = dailyOpinionCount < cfg.NEWS_MAX_POSTS_PER_DAY;

      if (shouldAttempt && canPostMore) {
        // Persist attempt start early (prevents rapid re-tries if later steps fail)
        workingState = { ...workingState, newsOpinionLastAttemptMs: nowMs };
        await saveState(workingState);

        try {
          logger.info("news.opinion.cycle.start", {
            lastAttemptMs,
            lastFetchMs: workingState.newsOpinionLastFetchMs,
            postsToday: dailyOpinionCount
          });

          const newsAggregator = new NewsAggregator(cfg);
          const fetched = await newsAggregator.fetchLatest(5);

          // Dedupe before any LLM usage
          const postedIds = new Set(workingState.postedNewsArticleIds || []);
          const articles = fetched.filter((a) => !postedIds.has(a.id));

          if (articles.length === 0) {
            logger.info("news.opinion.skip.all_seen_or_none", { fetched: fetched.length });
            return;
          }

          logger.info("news.opinion.fetched", { count: articles.length, fetched: fetched.length });

          // Efficient: ONE LLM call to pick + generate
          const opinionGen = new OpinionGenerator(cfg);
          const topOpinion = await opinionGen.generateTopOpinion(articles);

          if (!topOpinion) {
            logger.info("news.opinion.skip.no_opinion");
            return;
          }

          if (topOpinion.relevanceScore < (cfg.NEWS_MIN_RELEVANCE_SCORE || 0.5)) {
            logger.info("news.opinion.skip.irrelevant", {
              articleId: topOpinion.articleId,
              relevance: topOpinion.relevanceScore,
              minRelevance: cfg.NEWS_MIN_RELEVANCE_SCORE
            });
            return;
          }

          const article = articles.find((a) => a.id === topOpinion.articleId) ?? articles[0];
          const newsPoster = new NewsOpinionPoster(cfg, poster);
          const posted = await newsPoster.post(article, topOpinion);

          if (!posted) {
            logger.info("news.opinion.post.skipped", { articleId: article.id });
            return;
          }

          // Success: update state atomically (single save)
          const nextPostedIds = [...(workingState.postedNewsArticleIds || []), article.id].slice(-50);
          workingState = {
            ...workingState,
            newsOpinionLastFetchMs: nowMs,
            newsOpinionFailureCount: 0,
            newsOpinionCircuitBreakerDisabledUntilMs: null,
            newsOpinionPostsToday: (workingState.newsOpinionPostsToday || 0) + 1,
            postedNewsArticleIds: nextPostedIds
          };
          await saveState(workingState);

          logger.info("news.opinion.posted", {
            articleId: article.id,
            tone: topOpinion.tone,
            relevance: topOpinion.relevanceScore,
            confidence: topOpinion.confidence
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const failureCount = (workingState.newsOpinionFailureCount ?? 0) + 1;
          
          // Use configurable circuit breaker thresholds
          const failsThreshold = cfg.NEWS_OPINION_CIRCUIT_BREAKER_FAILS ?? 3;
          const minutesDuration = cfg.NEWS_OPINION_CIRCUIT_BREAKER_MINUTES ?? 30;
          const next = {
            ...workingState,
            newsOpinionFailureCount: failureCount,
            newsOpinionCircuitBreakerDisabledUntilMs: failureCount >= failsThreshold ? nowMs + minutesDuration * 60_000 : null
          };
          workingState = next;
          await saveState(workingState);

          logger.error("news.opinion.cycle.error", {
            error: msg,
            failureCount,
            circuitOpenUntil: next.newsOpinionCircuitBreakerDisabledUntilMs
          });
        }
      }
    }
  }
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const startedAtMs = Date.now();
  let lastTickStartedAtMs: number | null = null;
  let lastTickFinishedAtMs: number | null = null;
  let lastTickError: string | null = null;
  let tickInFlight = false;
  let manualTickRequested = false;
  let manualTickReason: string | null = null;

  let wakeSleep: (() => void) | null = null;
  const interruptibleSleep = async (ms: number) => {
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        wakeSleep = null;
        resolve();
      }, ms);
      wakeSleep = () => {
        clearTimeout(t);
        wakeSleep = null;
        resolve();
      };
    });
  };

  const control = startControlServer({
    enabled: cfg.CONTROL_ENABLED,
    bind: cfg.CONTROL_BIND,
    port: cfg.CONTROL_PORT,
    token: cfg.CONTROL_TOKEN?.trim() ?? null,
    getStatus: async () => {
      const state = await loadState();
      return {
        pid: process.pid,
        uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
        tick: {
          inFlight: tickInFlight,
          lastStartedAtMs: lastTickStartedAtMs,
          lastFinishedAtMs: lastTickFinishedAtMs,
          lastError: lastTickError
        },
        config: {
          chain: cfg.CHAIN,
          socialMode: cfg.SOCIAL_MODE,
          dryRun: cfg.DRY_RUN,
          tradingEnabled: cfg.TRADING_ENABLED,
          killSwitch: cfg.KILL_SWITCH,
          loopMinutes: cfg.LOOP_MINUTES,
          statePath: cfg.STATE_PATH
        },
        stateSummary: {
          lastPostDayUtc: state.lastPostDayUtc ?? null,
          lastSuccessfulMentionPollMs: state.lastSuccessfulMentionPollMs ?? null,
          tradesExecutedToday: state.tradesExecutedToday ?? null,
          lastExecutedTradeAtMs: state.lastExecutedTradeAtMs ?? null,
          newsLastPostMs: state.newsLastPostMs ?? null
        },
        railway: {
          serviceName: process.env.RAILWAY_SERVICE_NAME ?? null,
          environmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
          projectId: process.env.RAILWAY_PROJECT_ID ?? null,
          replicaId: process.env.RAILWAY_REPLICA_ID ?? null
        }
      };
    },
    requestTick: (reason: string) => {
      if (tickInFlight) return { accepted: false, message: "tick already in flight" };
      manualTickRequested = true;
      manualTickReason = reason;
      wakeSleep?.();
      return { accepted: true, message: "tick requested" };
    }
  });

  while (true) {
    const kind = manualTickRequested ? "manual" : "scheduled";
    const reason = manualTickReason;
    manualTickRequested = false;
    manualTickReason = null;

    tickInFlight = true;
    lastTickStartedAtMs = Date.now();
    lastTickFinishedAtMs = null;
    lastTickError = null;

    try {
      if (kind === "manual") {
        logger.info("manual tick starting", { reason });
      }
      await tick();
    } catch (err) {
      lastTickError = err instanceof Error ? err.message : String(err);
      logger.error("tick failed", { error: lastTickError });
    } finally {
      tickInFlight = false;
      lastTickFinishedAtMs = Date.now();
    }

    await interruptibleSleep(cfg.LOOP_MINUTES * 60_000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  logger.error("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});

import crypto from "node:crypto";
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
import { generateTradeAnnouncement } from "./social/tradeAnnouncements.js";
import { loadState, recordExecutedTrade, recordNewsPosted, saveState } from "./agent/state.js";
import { watchForActivity, parseMinEthDelta, parseMinTokenDelta, type ActivityWatchContext } from "./agent/watch.js";
import { createPoster } from "./social/poster.js";
import { createTradeExecutor } from "./chain/trade.js";
import { pollMentionsAndRespond, type MentionPollerContext } from "./social/x_mentions.js";
import { replyToMoltbookComments } from "./social/moltbook_comments.js";
import { postMoltbookDiscussion } from "./social/moltbook_discussions.js";
import { lpTick, type LPTickResult } from "./agent/lpManager.js";
import { postOpenClawAnnouncementOnce } from "./social/openclaw_announcement.js";
import { miniAppLaunchBurst, miniAppRecurringPost, isMiniAppCampaignEnabled } from "./social/miniapp_campaign.js";
import { buildNewsPlan } from "./news/news.js";
import { canonicalizeUrl } from "./news/fingerprint.js";
import { postNewsTweet } from "./social/news_poster.js";
import { startControlServer, recordAction } from "./control/server.js";
import { NewsAggregator, type NewsArticle } from "./news/fetcher.js";
import { OpinionGenerator } from "./news/opinion.js";
import { NewsOpinionPoster } from "./news/opinionPoster.js";
import { interruptibleSleep } from "./utils.js";

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

  // LP tick result — populated later by LP tick, used by discussion system for pool stats
  let lpResult: LPTickResult | null = null as LPTickResult | null;

  if (moltbookEnabledForDiscussions) {
    try {
      // Pass pool stats from LP tick if available (will be null on first run)
      const poolStats = lpResult
        ? { wethPool: lpResult.wethPool, usdcPool: lpResult.usdcPool }
        : undefined;
      const discussionResult = await postMoltbookDiscussion(cfg, state, saveState, poolStats);

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

  // ============================================================
  // MINI APP CAMPAIGN (launch burst + recurring viral posts)
  // ============================================================
  if (isMiniAppCampaignEnabled()) {
    try {
      // Reload state for freshest data
      const campState = await loadState();

      // Launch burst (one-time, 3 posts)
      const launchResult = await miniAppLaunchBurst(cfg, campState, saveState, poster);
      if (launchResult.posted) {
        logger.info("miniapp.campaign.launch_burst_complete", { postsCount: launchResult.postsCount });
        recordAction({ type: "social", timestamp: Date.now(), summary: "Mini app launch campaign posted to X + Moltbook", platform: "multi" });
      }

      // Recurring viral posts (every 4 hours, max 6/day)
      const latestState = launchResult.posted ? launchResult.state : campState;
      const recurringResult = await miniAppRecurringPost(cfg, latestState, saveState, poster);
      if (recurringResult.posted) {
        logger.info("miniapp.campaign.recurring_posted");
        recordAction({ type: "social", timestamp: Date.now(), summary: "Mini app viral post to X + Moltbook", platform: "multi" });
      }
    } catch (err) {
      logger.warn("miniapp.campaign.error", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
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

    // ============================================================
    // COMMUNITY HYPE TRADE ANNOUNCEMENT (fires after successful trades)
    // Posts to both X and Moltbook via poster.post() in multi-mode
    // ============================================================
    if (txHash && (decision.action === "BUY" || decision.action === "SELL")) {
      try {
        const { text: hypeText } = generateTradeAnnouncement({
          tradeType: decision.action,
          txHash,
          amountEth: decision.buySpendWei
            ? (Number(decision.buySpendWei) / 1e18).toFixed(6)
            : undefined,
          amountTokens: decision.sellAmount
            ? decision.sellAmount.toString()
            : undefined,
        }, workingState);

        await poster.post(hypeText);
        logger.info("trade announcement posted", {
          action: decision.action,
          txHash,
          textLength: hypeText.length,
        });
        recordAction({
          type: "trade",
          timestamp: Date.now(),
          summary: `${decision.action} executed — ${hypeText.slice(0, 100)}`,
          txHash: txHash ?? undefined,
        });
      } catch (err) {
        logger.warn("trade announcement failed (non-blocking)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update state with new day marker
    workingState.lastPostDayUtc = postDay;
    await saveState(workingState);

    // Always show guardrail block reasons in logs for operator visibility.
    if (decision.blockedReason) {
      logger.info("guardrails blocked trade", { blockedReason: decision.blockedReason });
    }
  }

  // ============================================================
  // LIQUIDITY PROVISION TICK (behind LP_ENABLED flag)
  // ============================================================
  if (cfg.LP_ENABLED && tokenAddress) {
    try {
      lpResult = await lpTick(cfg, clients, tokenAddress, workingState, saveState);

      if (lpResult.ran) {
        logger.info("lp.tick.complete", {
          wethTvl: lpResult.wethPool?.tvlWei.toString() ?? "n/a",
          usdcTvl: lpResult.usdcPool?.tvlWei.toString() ?? "n/a",
          actions: lpResult.actions.length,
          wethStaked: lpResult.gauge.wethStaked.toString(),
          wethEarned: lpResult.gauge.wethEarned.toString(),
        });
        for (const a of lpResult.actions) {
          recordAction({
            type: "lp",
            timestamp: Date.now(),
            summary: `LP: ${a.type} on ${a.pool}`,
            txHash: a.txHash ?? undefined,
          });
        }
      } else {
        logger.info("lp.tick.skipped", { reason: lpResult.skipReason });
      }
    } catch (err) {
      logger.warn("lp.tick.error", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with normal loop even if LP tick fails
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

    // Daily counter reset at UTC day boundary
    const todayUtc = new Date().toISOString().slice(0, 10);
    if ((workingState.newsOpinionLastDayUtc ?? "") !== todayUtc) {
      workingState = {
        ...workingState,
        newsOpinionPostsToday: 0,
        newsOpinionLastDayUtc: todayUtc
      };
      logger.info("news.opinion.daily_reset", { todayUtc });
    }

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

          const newsAggregator = new NewsAggregator(cfg, workingState.xTimelineSinceIds ?? {});
          const fetched = await newsAggregator.fetchLatest(10);

          // Persist updated since_ids so next cycle only gets NEW tweets
          const updatedSinceIds = newsAggregator.getUpdatedSinceIds();
          if (Object.keys(updatedSinceIds).length > 0) {
            workingState = {
              ...workingState,
              xTimelineSinceIds: {
                ...(workingState.xTimelineSinceIds ?? {}),
                ...updatedSinceIds
              }
            };
            await saveState(workingState);
          }

          // --- Dual-layer dedupe (restart-proof) ---
          // Layer 1: article IDs from state (provider-specific, can be unstable)
          const postedIds = new Set(workingState.postedNewsArticleIds || []);
          // Layer 2: canonical URL fingerprints (survives restarts, provider changes)
          const postedUrlFps = new Set(workingState.postedNewsUrlFingerprints || []);

          const articles = fetched.filter((a) => {
            // Check by article ID
            if (postedIds.has(a.id)) return false;
            // Check by canonical URL fingerprint
            const urlFp = crypto.createHash("sha256").update(canonicalizeUrl(a.url)).digest("hex");
            if (postedUrlFps.has(urlFp)) return false;
            return true;
          });

          if (articles.length === 0) {
            logger.info("news.opinion.skip.all_seen_or_none", { fetched: fetched.length });
            // Even if all articles are filtered, track their IDs so we never re-evaluate them
            // (important on first run when since_id isn't set yet)
            if (fetched.length > 0) {
              const allFetchedIds = [...(workingState.postedNewsArticleIds || [])];
              const allFetchedFps = [...(workingState.postedNewsUrlFingerprints || [])];
              for (const a of fetched) {
                if (!postedIds.has(a.id)) allFetchedIds.push(a.id);
                const fp = crypto.createHash("sha256").update(canonicalizeUrl(a.url)).digest("hex");
                if (!postedUrlFps.has(fp)) allFetchedFps.push(fp);
              }
              workingState = {
                ...workingState,
                postedNewsArticleIds: allFetchedIds.slice(-200),
                postedNewsUrlFingerprints: allFetchedFps.slice(-200)
              };
              await saveState(workingState);
            }
            // continue — do not return from tick()
          } else {
          logger.info("news.opinion.fetched", { count: articles.length, fetched: fetched.length });

          // Helper: track all fetched article IDs even when skipped/filtered
          // Prevents re-evaluation on subsequent cycles (belt-and-suspenders with since_id)
          const trackAllFetchedArticles = async (arts: typeof articles) => {
            const nextIds = [...(workingState.postedNewsArticleIds || [])];
            const nextFps = [...(workingState.postedNewsUrlFingerprints || [])];
            for (const a of arts) {
              if (!nextIds.includes(a.id)) nextIds.push(a.id);
              const fp = crypto.createHash("sha256").update(canonicalizeUrl(a.url)).digest("hex");
              if (!nextFps.includes(fp)) nextFps.push(fp);
            }
            workingState = {
              ...workingState,
              postedNewsArticleIds: nextIds.slice(-200),
              postedNewsUrlFingerprints: nextFps.slice(-200)
            };
            await saveState(workingState);
          };

          // Efficient: ONE LLM call to pick + generate
          const opinionGen = new OpinionGenerator(cfg);
          const topOpinion = await opinionGen.generateTopOpinion(articles);

          if (!topOpinion) {
            logger.info("news.opinion.skip.no_opinion");
            // Track all unseen articles so they don't get re-evaluated
            await trackAllFetchedArticles(articles);
          } else if (topOpinion.relevanceScore < (cfg.NEWS_MIN_RELEVANCE_SCORE || 0.5)) {
            logger.info("news.opinion.skip.irrelevant", {
              articleId: topOpinion.articleId,
              relevance: topOpinion.relevanceScore,
              minRelevance: cfg.NEWS_MIN_RELEVANCE_SCORE
            });
            // Track all unseen articles so irrelevant ones don't get re-evaluated
            await trackAllFetchedArticles(articles);
          } else {
            const article = articles.find((a) => a.id === topOpinion.articleId) ?? articles[0];
            const newsPoster = new NewsOpinionPoster(cfg, poster, postedIds, postedUrlFps);
            const posted = await newsPoster.post(article, topOpinion);

            if (!posted) {
              logger.info("news.opinion.post.skipped", { articleId: article.id });
              // Track all articles to prevent re-evaluation even when post is skipped
              await trackAllFetchedArticles(articles);
            } else {
              // Success: track ALL fetched articles (not just the posted one) to prevent re-evaluation
              const nextPostedIds = [...(workingState.postedNewsArticleIds || [])];
              const nextUrlFps = [...(workingState.postedNewsUrlFingerprints || [])];
              for (const a of articles) {
                if (!nextPostedIds.includes(a.id)) nextPostedIds.push(a.id);
                const fp = crypto.createHash("sha256").update(canonicalizeUrl(a.url)).digest("hex");
                if (!nextUrlFps.includes(fp)) nextUrlFps.push(fp);
              }
              workingState = {
                ...workingState,
                newsOpinionLastFetchMs: nowMs,
                newsOpinionFailureCount: 0,
                newsOpinionCircuitBreakerDisabledUntilMs: null,
                newsOpinionPostsToday: (workingState.newsOpinionPostsToday || 0) + 1,
                postedNewsArticleIds: nextPostedIds,
                postedNewsUrlFingerprints: nextUrlFps
              };
              await saveState(workingState);

              recordAction({
                type: "news",
                timestamp: Date.now(),
                summary: `News take: ${article.title?.slice(0, 80) ?? topOpinion.articleId}`,
              });
              logger.info("news.opinion.posted", {
                articleId: article.id,
                tone: topOpinion.tone,
                relevance: topOpinion.relevanceScore,
                confidence: topOpinion.confidence
              });
            }
          }
          } // end articles else
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

  // Use shared interruptible sleep for the main loop
  let currentSleep: ReturnType<typeof interruptibleSleep> | null = null;

  // Resolve chain clients + token for mini app API
  const miniClients = createChainClients(cfg);
  const miniTokenAddress = await resolveTokenAddress(cfg);
  const miniWallet = miniClients.walletAddress;

  const control = startControlServer({
    enabled: cfg.CONTROL_ENABLED,
    bind: cfg.CONTROL_BIND,
    port: cfg.CONTROL_PORT,
    token: cfg.CONTROL_TOKEN?.trim() ?? null,
    miniAppData: {
      getAgentStats: async () => {
        const st = await loadState();
        return {
          status: "live" as const,
          lastTradeAt: st.lastExecutedTradeAtMs ?? null,
          tradesToday: st.tradesExecutedToday ?? 0,
          lpTvlWei: st.lpWethPoolTvlWei ?? null,
          lpSharePercent: null,
          socialPostsToday: (st.lpCampaignPostsToday ?? 0) + (st.newsDailyCount ?? 0),
          uptime: Math.floor((Date.now() - startedAtMs) / 1000),
          dryRun: cfg.DRY_RUN,
        };
      },
      getPoolData: async () => {
        if (!miniTokenAddress || !miniWallet || !cfg.POOL_ADDRESS) return null;
        try {
          const { readPoolStats } = await import("./chain/liquidity.js");
          const pool = await readPoolStats(
            miniClients,
            cfg.POOL_ADDRESS as Address,
            miniWallet,
            cfg.WETH_ADDRESS as Address,
            "INTERN/WETH",
            cfg.AERODROME_STABLE ?? false,
          );
          if (!pool) return null;
          return {
            tvlWei: pool.tvlWei.toString(),
            reserve0: pool.reserve0.toString(),
            reserve1: pool.reserve1.toString(),
            internPrice: pool.reserve0 > 0n
              ? (Number(pool.reserve0) / Number(pool.reserve1 || 1n)).toFixed(12)
              : "0",
            poolAddress: cfg.POOL_ADDRESS,
          };
        } catch {
          return null;
        }
      },
      getTokenData: async () => {
        if (!miniTokenAddress) return null;
        try {
          const decimals = await readErc20Decimals(miniClients, miniTokenAddress);
          return {
            price: "—",
            totalSupply: "1000000000",
            symbol: "INTERN",
            decimals,
          };
        } catch {
          return null;
        }
      },
    },
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
      currentSleep?.wake();
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

    currentSleep = interruptibleSleep(cfg.LOOP_MINUTES * 60_000);
    await currentSleep.promise;
    currentSleep = null;
  }
}

main().catch((err) => {
  logger.error("fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});

import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { addSeenNewsFingerprint, resetNewsDailyCountIfNeeded } from "../agent/state.js";
import { logger } from "../logger.js";
import { canonicalizeUrl, fingerprintNewsItem } from "./fingerprint.js";
import { allKnownNewsSources, parseNewsSourcesCsv } from "./sources.js";
import { rankNewsItems } from "./score.js";
import type { NewsItem, NewsPlan, NewsSourceId } from "./types.js";

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isKnownNewsSource(s: string): s is NewsSourceId {
  return s === "x_timeline" || s === "cryptopanic";
}

export function selectedNewsSourcesFromConfig(cfg: AppConfig): { sources: NewsSourceId[]; rejected: string[] } {
  const raw = parseNewsSourcesCsv(cfg.NEWS_SOURCES);
  const rejected: string[] = [];
  const sources: NewsSourceId[] = [];

  for (const s of raw) {
    if (isKnownNewsSource(s)) sources.push(s);
    else rejected.push(s);
  }

  if (cfg.NEWS_REQUIRE_SOURCE_WHITELIST) {
    return { sources: sources.length ? sources : allKnownNewsSources(), rejected };
  }

  // If whitelist is not required, we still only support known sources.
  // Unknown entries are ignored but surfaced in logs.
  return { sources: sources.length ? sources : allKnownNewsSources(), rejected };
}

/**
 * Legacy HTML/RSS/GitHub news providers have been removed (all returned 403 or were disabled).
 * Primary news source is now the X Timeline fetcher in fetcher.ts (opinion pipeline).
 * This legacy pipeline returns empty items — kept for backward compatibility.
 */
async function getLatestNewsFromProviders(_args: { cfg: AppConfig; sources: NewsSourceId[]; maxItems: number }): Promise<NewsItem[]> {
  // All legacy HTML sources (base_blog, base_dev_blog, cdp_launches) removed — 403 Forbidden
  // DeFiLlama, RSS, GitHub feeds also removed
  // X timeline and CryptoPanic are handled by the opinion pipeline in fetcher.ts
  return [];
}

export function filterUnseenNewsItems(state: AgentState, items: NewsItem[]): NewsItem[] {
  const seen = new Set(state.seenNewsFingerprints ?? []);
  return items.filter((it) => !seen.has(it.id));
}

export function shouldPostNewsNow(args: {
  cfg: AppConfig;
  state: AgentState;
  now: Date;
  unseenItems: NewsItem[];
}): NewsPlan {
  const reasons: string[] = [];

  if (!args.cfg.NEWS_ENABLED) {
    reasons.push("NEWS_ENABLED=false");
    return { shouldPost: false, reasons };
  }

  // Daily reset
  const stateWithReset = resetNewsDailyCountIfNeeded(args.state, args.now);
  const today = utcDayKey(args.now);

  if ((stateWithReset.newsDailyCount ?? 0) >= args.cfg.NEWS_MAX_POSTS_PER_DAY) {
    reasons.push("daily cap reached");
    return { shouldPost: false, reasons };
  }

  if (stateWithReset.newsLastPostMs) {
    const mins = (args.now.getTime() - stateWithReset.newsLastPostMs) / 1000 / 60;
    if (mins < args.cfg.NEWS_MIN_INTERVAL_MINUTES) {
      reasons.push("min interval not met");
      return { shouldPost: false, reasons };
    }
  }

  if (args.cfg.NEWS_MODE === "daily") {
    const hour = args.now.getUTCHours();
    if (hour !== args.cfg.NEWS_DAILY_HOUR_UTC) {
      reasons.push("not daily hour");
      return { shouldPost: false, reasons };
    }

    // Don't post twice on same UTC day.
    if (stateWithReset.newsLastPostDayUtc === today) {
      reasons.push("already posted today");
      return { shouldPost: false, reasons };
    }

    if (!args.unseenItems.length) {
      reasons.push("no unseen items");
      return { shouldPost: false, reasons };
    }

    reasons.push("daily mode window");
    return { shouldPost: true, item: args.unseenItems[0], reasons };
  }

  // event mode
  if (!args.unseenItems.length) {
    reasons.push("no unseen items");
    return { shouldPost: false, reasons };
  }

  reasons.push("event mode + unseen item");
  return { shouldPost: true, item: args.unseenItems[0], reasons };
}

export async function buildNewsPlan(args: { cfg: AppConfig; state: AgentState; now: Date }): Promise<{ plan: NewsPlan; items: NewsItem[]; unseenItems: NewsItem[]; rejectedSources: string[] }>{
  const { sources, rejected } = selectedNewsSourcesFromConfig(args.cfg);
  if (rejected.length) {
    logger.warn("news.sources rejected", { rejected });
  }

  const rawItems = await getLatestNewsFromProviders({ cfg: args.cfg, sources, maxItems: Math.max(args.cfg.NEWS_MAX_ITEMS_CONTEXT, 25) });

  // Score + rank, then apply NEWS_MIN_SCORE threshold.
  const ranked = rankNewsItems(args.now.getTime(), rawItems).filter((it) => (it.score ?? 0) >= args.cfg.NEWS_MIN_SCORE);
  const items = ranked.slice(0, args.cfg.NEWS_MAX_ITEMS_CONTEXT);
  const unseenItems = filterUnseenNewsItems(args.state, items);

  const plan = shouldPostNewsNow({
    cfg: args.cfg,
    state: args.state,
    now: args.now,
    unseenItems
  });

  return { plan, items, unseenItems, rejectedSources: rejected };
}

export function applyNewsSeenUpdate(state: AgentState, item: NewsItem): AgentState {
  return addSeenNewsFingerprint(state, item.id, 50);
}

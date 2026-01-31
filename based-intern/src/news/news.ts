import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { addSeenNewsFingerprint, resetNewsDailyCountIfNeeded } from "../agent/state.js";
import { logger } from "../logger.js";
import { canonicalizeUrl, fingerprintNewsItem } from "./fingerprint.js";
import { allKnownNewsSources, fetchAndParseNewsSource, parseNewsSourcesCsv } from "./sources.js";
import type { NewsItem, NewsPlan, NewsSourceId } from "./types.js";

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isKnownNewsSource(s: string): s is NewsSourceId {
  return s === "base_blog" || s === "base_dev_blog" || s === "cdp_launches";
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

export async function getLatestNews(args: { sources: NewsSourceId[]; maxItems: number }): Promise<NewsItem[]> {
  const results = await Promise.all(args.sources.map((s) => fetchAndParseNewsSource(s)));

  const items: NewsItem[] = [];
  for (const r of results) {
    for (const it of r.items) {
      // Ensure URL/title invariants
      if (!it.url || !it.title) continue;
      const canonicalUrl = canonicalizeUrl(it.url);
      const id = it.id && it.id.trim()
        ? it.id
        : fingerprintNewsItem({ source: it.source, title: it.title, url: canonicalUrl });

      items.push({
        ...it,
        id,
        url: canonicalUrl
      });
    }
  }

  // Sort newest first when publishedAtMs available; otherwise keep stable-ish order.
  items.sort((a, b) => {
    const ap = a.publishedAtMs ?? 0;
    const bp = b.publishedAtMs ?? 0;
    return bp - ap;
  });

  // Deduplicate by canonical url
  const seen = new Set<string>();
  const uniq: NewsItem[] = [];
  for (const it of items) {
    const key = canonicalizeUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }

  return uniq.slice(0, args.maxItems);
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

  const items = await getLatestNews({ sources, maxItems: args.cfg.NEWS_MAX_ITEMS_CONTEXT });
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

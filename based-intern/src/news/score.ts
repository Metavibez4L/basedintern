import type { NewsItem } from "./types.js";

function norm01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function recencyScore(nowMs: number, publishedAtMs: number | undefined): number {
  if (!publishedAtMs) return 0.25;
  const ageMs = Math.max(0, nowMs - publishedAtMs);
  const ageHours = ageMs / 3_600_000;
  const halfLifeHours = 24;
  return norm01(Math.pow(0.5, ageHours / halfLifeHours));
}

function keywordBoost(title: string, tags: string[] | undefined): number {
  const t = title.toLowerCase();
  const has = (kw: string) => t.includes(kw);

  let boost = 0;

  if (has("release") || has("releases") || tags?.includes("release")) boost += 0.18;
  if (has("upgrade") || has("hardfork") || tags?.includes("upgrade")) boost += 0.18;
  if (has("security") || has("vuln") || tags?.includes("security")) boost += 0.22;
  if (has("exploit") || has("hack") || tags?.includes("exploit")) boost += 0.25;

  // Base relevance
  if (has("base") || tags?.includes("base")) boost += 0.15;

  return norm01(boost);
}

export function scoreNewsItem(nowMs: number, item: NewsItem): number {
  const r = recencyScore(nowMs, item.publishedAtMs);
  const k = keywordBoost(item.title, item.tags);

  // Recency dominates, keywords adjust.
  return norm01(0.72 * r + 0.28 * k);
}

export function rankNewsItems(nowMs: number, items: NewsItem[]): NewsItem[] {
  const withScores = items.map((it) => ({ ...it, score: scoreNewsItem(nowMs, it) }));

  return withScores.sort((a, b) => {
    const ds = (b.score ?? 0) - (a.score ?? 0);
    if (ds !== 0) return ds;

    const at = a.publishedAtMs ?? 0;
    const bt = b.publishedAtMs ?? 0;
    const dt = bt - at;
    if (dt !== 0) return dt;

    return a.fingerprint.localeCompare(b.fingerprint);
  });
}

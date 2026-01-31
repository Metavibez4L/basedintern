import { logger } from "../logger.js";
import { canonicalizeUrl, fingerprintNewsItem } from "./fingerprint.js";
import type { NewsItem, NewsSourceId, ParsedNewsResult } from "./types.js";

const SOURCE_URLS: Record<NewsSourceId, string> = {
  base_blog: "https://blog.base.org/",
  base_dev_blog: "https://blog.base.dev/",
  cdp_launches: "https://www.coinbase.com/developer-platform/discover/launches"
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(s: string): string {
  // Minimal decode; defensive (no heavy deps)
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

type Anchor = { href: string; text: string };

function extractAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? "").trim();
    const text = decodeHtmlEntities(stripTags(m[2] ?? ""));
    if (!href || !text) continue;
    out.push({ href, text });
  }
  return out;
}

function toAbsoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] ?? "";
    if (!slug) return url;
    return decodeHtmlEntities(slug.replace(/[-_]+/g, " "));
  } catch {
    return url;
  }
}

function uniqByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = canonicalizeUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function parseBaseBlogLike(args: { source: "base_blog" | "base_dev_blog"; html: string; baseUrl: string }): ParsedNewsResult {
  const anchors = extractAnchors(args.html);

  const items: NewsItem[] = [];
  for (const a of anchors) {
    const absUrl = toAbsoluteUrl(args.baseUrl, a.href);

    // Heuristic: accept only same-host links that look like posts (avoid nav/tag pages)
    let hostOk = false;
    try {
      const u = new URL(absUrl);
      hostOk = u.hostname.endsWith(new URL(args.baseUrl).hostname);
    } catch {
      hostOk = false;
    }
    if (!hostOk) continue;

    // Avoid obvious non-post pages
    if (/\/(tag|tags|category|categories|author|authors)\b/i.test(absUrl)) continue;

    const title = a.text.length >= 8 ? a.text : titleFromUrl(absUrl);
    if (!title || !absUrl) continue;

    const canonical = canonicalizeUrl(absUrl);
    const id = fingerprintNewsItem({ source: args.source, title, url: canonical });

    items.push({
      id,
      source: args.source,
      title,
      url: canonical
    });
  }

  return {
    source: args.source,
    items: uniqByUrl(items).slice(0, 50),
    errors: []
  };
}

function parseCdpLaunches(html: string): ParsedNewsResult {
  const source: NewsSourceId = "cdp_launches";
  const baseUrl = SOURCE_URLS.cdp_launches;

  const anchors = extractAnchors(html);
  const items: NewsItem[] = [];

  for (const a of anchors) {
    const absUrl = toAbsoluteUrl(baseUrl, a.href);

    // Heuristic: only keep links under /developer-platform/discover/launches
    if (!absUrl.includes("/developer-platform/")) continue;

    const title = a.text.length >= 8 ? a.text : titleFromUrl(absUrl);
    if (!title || !absUrl) continue;

    const canonical = canonicalizeUrl(absUrl);
    const id = fingerprintNewsItem({ source, title, url: canonical });

    items.push({
      id,
      source,
      title,
      url: canonical
    });
  }

  return {
    source,
    items: uniqByUrl(items).slice(0, 50),
    errors: []
  };
}

export function allKnownNewsSources(): NewsSourceId[] {
  return ["base_blog", "base_dev_blog", "cdp_launches"];
}

export function parseNewsSourcesCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function fetchAndParseNewsSource(source: NewsSourceId): Promise<ParsedNewsResult> {
  const url = SOURCE_URLS[source];

  const maxAttempts = 3;
  let lastErr: string | null = null;
  let res: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          // Some sites respond with 403/429 to missing/odd UAs.
          "User-Agent": "BasedIntern/0.1 (+https://github.com/Metavibez4L/basedintern)"
        },
        signal: controller.signal
      });
      lastErr = null;

      if (res.ok) break;

      const status = res.status;
      logger.warn("news.fetch non-200", {
        source,
        url,
        status,
        statusText: (res as any).statusText ?? undefined,
        finalUrl: (res as any).url ?? undefined,
        attempt
      });

      if (attempt < maxAttempts && shouldRetryStatus(status)) {
        await sleep(400 * attempt);
        continue;
      }

      // Non-retriable HTTP failure
      return { source, items: [], errors: [`HTTP ${status}`] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = msg;
      logger.warn("news.fetch failed", { source, url, attempt, error: msg });
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!res || !res.ok) {
    return { source, items: [], errors: [lastErr ?? "fetch failed"] };
  }

  const html = await res.text().catch(() => "");

  try {
    if (source === "base_blog" || source === "base_dev_blog") {
      return parseBaseBlogLike({ source, html, baseUrl: url });
    }
    return parseCdpLaunches(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("news.parse failed", { source, url, error: msg });
    return { source, items: [], errors: [msg] };
  }
}

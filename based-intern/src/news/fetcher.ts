import crypto from "crypto";
import { z } from "zod";
import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetry(url: string, init?: RequestInit, opts?: { retries?: number; timeoutMs?: number }): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 15000;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      // Retry common transient statuses.
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      // Exponential backoff: 0.5s, 1s, 2s...
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const NewsArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
  source: z.string(),
  content: z.string().optional(),
  summary: z.string().optional(),
  category: z.enum(["crypto", "base", "defi", "general"]).default("general"),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;

export interface NewsFetcher {
  fetch(): Promise<NewsArticle[]>;
}

// Multi-source news aggregator
export class NewsAggregator {
  private fetchers: NewsFetcher[];

  constructor(private cfg: AppConfig) {
    this.fetchers = [];
    
    // Primary: X timelines (highest signal, real-time)
    if (cfg.X_API_KEY && cfg.X_API_SECRET && cfg.X_ACCESS_TOKEN && cfg.X_ACCESS_SECRET) {
      for (const username of X_WATCH_ACCOUNTS) {
        this.fetchers.push(new XTimelineFetcher(cfg, username));
      }
    }

    // Add fetchers based on config
    if (cfg.NEWS_CRYPTO_PANIC_KEY) {
      this.fetchers.push(new CryptoPanicFetcher(cfg.NEWS_CRYPTO_PANIC_KEY, cfg));
    }
    // RSS removed — flaky, replaced by @base X timeline
    // Always include Base ecosystem monitor
    this.fetchers.push(new BaseEcosystemFetcher(cfg));
  }

  async fetchLatest(limit = 10): Promise<NewsArticle[]> {
    const results = await Promise.allSettled(
      this.fetchers.map((f) => f.fetch())
    );

    const articles: NewsArticle[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        articles.push(...result.value);
      } else {
        logger.warn("news.fetch.failed", { 
          error: result.reason?.message ?? String(result.reason) 
        });
      }
    }

    // Dedupe by URL, sort by date, take top N
    const seen = new Set<string>();
    const unique = articles.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    return unique
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit);
  }
}

// CryptoPanic API integration
class CryptoPanicFetcher implements NewsFetcher {
  constructor(
    private apiKey: string,
    private cfg: AppConfig
  ) {}

  async fetch(): Promise<NewsArticle[]> {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.apiKey}&currencies=ETH,BASE&filter=hot`;
    
    try {
      const res = await fetchWithRetry(url, { 
        headers: { "User-Agent": "BasedIntern/1.0" } 
      }, {
        timeoutMs: this.cfg.NEWS_HTTP_TIMEOUT_MS,
        retries: this.cfg.NEWS_HTTP_RETRIES
      });
      if (!res.ok) throw new Error(`CryptoPanic ${res.status}`);
      
      const data: any = await res.json();
      return (data.results || []).map((item: any) => ({
        id: `cryptopanic_${item.id}`,
        title: item.title,
        url: item.url,
        publishedAt: item.published_at,
        source: item.source.title,
        category: "crypto" as const,
      }));
    } catch (err) {
      logger.warn("news.cryptopanic.error", { 
        error: err instanceof Error ? err.message : String(err) 
      });
      return [];
    }
  }
}

// RSS feed parser (for Base blog, DeFi newsletters, etc.)
class RSSFetcher implements NewsFetcher {
  constructor(
    private feeds: string[],
    private cfg: AppConfig
  ) {}

  async fetch(): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    
    for (const feedUrl of this.feeds) {
      try {
        const res = await fetchWithRetry(feedUrl, { 
          headers: { "User-Agent": "BasedIntern/1.0" } 
        }, {
          timeoutMs: this.cfg.NEWS_HTTP_TIMEOUT_MS,
          retries: this.cfg.NEWS_HTTP_RETRIES
        });
        if (!res.ok) {
          logger.warn("news.rss.http_error", { feedUrl, status: res.status });
          continue;
        }
        
        // Body timeout: prevent hanging on slow/chunked responses
        const bodyTimeoutMs = this.cfg.NEWS_HTTP_TIMEOUT_MS ?? 15000;
        const text = await Promise.race([
          res.text(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`RSS body timeout after ${bodyTimeoutMs}ms`)), bodyTimeoutMs)
          )
        ]);

        // Size guard: skip feeds larger than 5MB (prevents OOM)
        if (text.length > 5_000_000) {
          logger.warn("news.rss.too_large", { feedUrl, bytes: text.length });
          continue;
        }
        const isAtom = text.includes("<feed") || text.includes("<entry>");
        
        if (isAtom) {
          // Atom feed parsing (<entry> elements)
          const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
          const entries = text.match(entryRegex) || [];
          
          for (const entry of entries.slice(0, 5)) {
            const title = this.extractTag(entry, "title");
            // Atom uses <link href="..."/> (self-closing) or <link>text</link>
            const link = this.extractAtomLink(entry);
            const updated = this.extractTag(entry, "updated") || this.extractTag(entry, "published");
            const entryId = this.extractTag(entry, "id");
            
            if (title && link) {
              // Stable ID: prefer entry ID, fallback to SHA256 of URL (collision-resistant)
              const stableId = entryId || `atom_${crypto.createHash("sha256").update(link).digest("hex").slice(0, 24)}`;
              articles.push({
                id: stableId,
                title,
                url: link,
                publishedAt: updated || new Date().toISOString(),
                source: new URL(feedUrl).hostname,
                category: feedUrl.includes("base") ? "base" as const : "general" as const,
              });
            }
          }
        } else {
          // RSS feed parsing (<item> elements)
          const itemRegex = /<item>[\s\S]*?<\/item>/g;
          const items = text.match(itemRegex) || [];
          
          for (const item of items.slice(0, 5)) {
            const title = this.extractTag(item, "title");
            const link = this.extractTag(item, "link");
            const pubDate = this.extractTag(item, "pubDate");
            
            if (title && link) {
              // Stable ID: SHA256 of URL (collision-resistant, replaces truncated base64)
              const stableId = `rss_${crypto.createHash("sha256").update(link).digest("hex").slice(0, 24)}`;
              articles.push({
                id: stableId,
                title,
                url: link,
                publishedAt: pubDate || new Date().toISOString(),
                source: new URL(feedUrl).hostname,
                category: "general" as const,
              });
            }
          }
        }
      } catch (err) {
        logger.warn("news.rss.error", { 
          feedUrl, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }
    
    return articles;
  }

  private extractTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
  }

  /** Extract href from Atom <link> element: <link href="..." rel="alternate"/> */
  private extractAtomLink(xml: string): string {
    // Prefer rel="alternate" link, fall back to any <link href="...">
    const altMatch = xml.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/);
    if (altMatch) return altMatch[1];
    const hrefMatch = xml.match(/<link[^>]+href=["']([^"']+)["']/);
    if (hrefMatch) return hrefMatch[1];
    // Fall back to tag content
    return this.extractTag(xml, "link");
  }
}

// X accounts to watch for news/opinions (no new env vars needed)
const X_WATCH_ACCOUNTS = ["base", "buildonbase", "openclaw"] as const;

// X Timeline fetcher — pulls recent tweets from watched accounts
// Uses existing X API credentials (no new env vars)
class XTimelineFetcher implements NewsFetcher {
  private cachedUserId: string | null = null;

  constructor(private cfg: AppConfig, private username: string = "base") {}

  async fetch(): Promise<NewsArticle[]> {
    try {
      // Resolve user ID (cached after first lookup)
      const userId = await this.resolveUserId();
      if (!userId) return [];

      // Fetch recent tweets (up to 10, exclude replies and retweets)
      const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,text,entities&exclude=replies,retweets`;

      const authHeader = this.buildOAuth1Header("GET", url);
      const res = await fetchWithRetry(url, {
        headers: {
          "Authorization": authHeader,
          "User-Agent": "BasedIntern/1.0"
        }
      }, {
        timeoutMs: this.cfg.NEWS_HTTP_TIMEOUT_MS ?? 15000,
        retries: 1  // Light retry — X rate limits are strict
      });

      if (!res.ok) {
        logger.warn("news.x_timeline.http_error", { status: res.status });
        return [];
      }

      const data: any = await res.json();
      const tweets = data?.data || [];

      return tweets
        .filter((t: any) => t.text && !t.text.startsWith("RT "))
        .map((t: any) => {
          // Extract first URL from tweet entities if available
          const tweetUrl = t.entities?.urls?.[0]?.expanded_url
            || `https://x.com/base/status/${t.id}`;

          return {
            id: `x_${this.username}_${t.id}`,
            title: this.extractTitle(t.text),
            url: tweetUrl,
            publishedAt: t.created_at || new Date().toISOString(),
            source: `@${this.username} (X)`,
            category: "base" as const,
            content: t.text,
          };
        });
    } catch (err) {
      logger.warn("news.x_timeline.error", {
        error: err instanceof Error ? err.message : String(err)
      });
      return [];
    }
  }

  /** Extract a clean title from tweet text (first sentence or first 80 chars) */
  private extractTitle(text: string): string {
    // Remove URLs
    const cleaned = text.replace(/https?:\/\/\S+/g, "").trim();
    // Take first sentence or first 80 chars
    const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 10) {
      return firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence;
    }
    return cleaned.length > 80 ? cleaned.slice(0, 77) + "..." : cleaned || "Base update";
  }

  /** Look up X user ID by username via X API v2 */
  private async resolveUserId(): Promise<string | null> {
    if (this.cachedUserId) return this.cachedUserId;

    try {
      const url = `https://api.twitter.com/2/users/by/username/${this.username}`;
      const authHeader = this.buildOAuth1Header("GET", url);
      const res = await fetchWithRetry(url, {
        headers: {
          "Authorization": authHeader,
          "User-Agent": "BasedIntern/1.0"
        }
      }, { timeoutMs: 10000, retries: 1 });

      if (!res.ok) {
        logger.warn("news.x_timeline.user_lookup_failed", { username: this.username, status: res.status });
        return null;
      }

      const data: any = await res.json();
      this.cachedUserId = data?.data?.id || null;
      if (this.cachedUserId) {
        logger.info("news.x_timeline.resolved_user", { userId: this.cachedUserId, username: this.username });
      }
      return this.cachedUserId;
    } catch (err) {
      logger.warn("news.x_timeline.user_lookup_error", {
        username: this.username,
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  /** Build OAuth 1.0a Authorization header (reuses pattern from x_mentions.ts) */
  private buildOAuth1Header(method: string, url: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const consumerKey = this.cfg.X_API_KEY || "";
    const consumerSecret = this.cfg.X_API_SECRET || "";
    const accessToken = this.cfg.X_ACCESS_TOKEN || "";
    const accessSecret = this.cfg.X_ACCESS_SECRET || "";

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: accessToken,
      oauth_version: "1.0"
    };

    // Build signature base string
    const u = new URL(url);
    const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
    const params: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(oauthParams)) params.push([k, v]);
    for (const [k, v] of u.searchParams.entries()) params.push([k, v]);
    params.sort(([ak, av], [bk, bv]) => (ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk)));
    const normalized = params.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join("&");
    const baseString = `${method.toUpperCase()}&${rfc3986(baseUrl)}&${rfc3986(normalized)}`;

    // Sign
    const signingKey = `${rfc3986(consumerSecret)}&${rfc3986(accessSecret)}`;
    const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

    const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
    return "OAuth " + Object.keys(headerParams).sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k] ?? "")}"`)
      .join(", ");
  }
}

function rfc3986(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// Base ecosystem monitor (GitHub activity, governance proposals)
class BaseEcosystemFetcher implements NewsFetcher {
  constructor(private cfg: AppConfig) {}

  async fetch(): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    
    // Monitor Base GitHub org for releases
    try {
      const res = await fetchWithRetry("https://api.github.com/repos/base-org/node/releases?per_page=3", {
        headers: {
          "User-Agent": "BasedIntern/1.0",
          "Accept": "application/vnd.github+json"
        }
      }, {
        timeoutMs: this.cfg.NEWS_HTTP_TIMEOUT_MS,
        retries: this.cfg.NEWS_HTTP_RETRIES
      });
      if (res.ok) {
        const releases: any = await res.json();
        for (const release of releases) {
          articles.push({
            id: `github_base_${release.id}`,
            title: `Base Release: ${release.name}`,
            url: release.html_url,
            publishedAt: release.published_at,
            source: "Base GitHub",
            category: "base",
          });
        }
      }
    } catch (err) {
      logger.warn("news.base.github.error", { 
        error: err instanceof Error ? err.message : String(err) 
      });
    }
    
    return articles;
  }
}

import { z } from "zod";
import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";

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
    
    // Add fetchers based on config
    if (cfg.NEWS_CRYPTO_PANIC_KEY) {
      this.fetchers.push(new CryptoPanicFetcher(cfg.NEWS_CRYPTO_PANIC_KEY));
    }
    if (cfg.NEWS_RSS_FEEDS?.length) {
      this.fetchers.push(new RSSFetcher(cfg.NEWS_RSS_FEEDS));
    }
    // Always include Base ecosystem monitor
    this.fetchers.push(new BaseEcosystemFetcher());
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
  constructor(private apiKey: string) {}

  async fetch(): Promise<NewsArticle[]> {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.apiKey}&currencies=ETH,BASE&filter=hot`;
    
    try {
      const res = await fetch(url);
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
  constructor(private feeds: string[]) {}

  async fetch(): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    
    for (const feedUrl of this.feeds) {
      try {
        const res = await fetch(feedUrl);
        if (!res.ok) continue;
        
        const text = await res.text();
        
        // Basic RSS/Atom parsing (extract items)
        const itemRegex = /<item>[\s\S]*?<\/item>/g;
        const items = text.match(itemRegex) || [];
        
        for (const item of items.slice(0, 5)) {
          const title = this.extractTag(item, "title");
          const link = this.extractTag(item, "link");
          const pubDate = this.extractTag(item, "pubDate");
          
          if (title && link) {
            articles.push({
              id: `rss_${Buffer.from(link).toString("base64").slice(0, 12)}`,
              title,
              url: link,
              publishedAt: pubDate || new Date().toISOString(),
              source: new URL(feedUrl).hostname,
              category: "general" as const,
            });
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
}

// Base ecosystem monitor (GitHub activity, governance proposals)
class BaseEcosystemFetcher implements NewsFetcher {
  async fetch(): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    
    // Monitor Base GitHub org for releases
    try {
      const res = await fetch("https://api.github.com/repos/base-org/node/releases?per_page=3");
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

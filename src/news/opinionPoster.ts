import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";
import type { NewsArticle } from "./fetcher.js";
import type { Opinion } from "./opinion.js";
import type { SocialPoster } from "../social/poster.js";

export interface NewsPost {
  article: NewsArticle;
  opinion: Opinion;
  postedAt: string;
  postId?: string; // X tweet ID or Moltbook post ID
}

export class NewsOpinionPoster {
  private lastPostedIds = new Set<string>();

  constructor(
    private cfg: AppConfig,
    private socialPoster: SocialPoster
  ) {}

  async post(article: NewsArticle, opinion: Opinion): Promise<NewsPost | null> {
    // Skip if already posted
    if (this.lastPostedIds.has(article.id)) {
      logger.info("news.opinion.skip.duplicate", { articleId: article.id });
      return null;
    }

    // Skip if relevance too low
    if (opinion.relevanceScore < (this.cfg.NEWS_MIN_RELEVANCE_SCORE || 0.5)) {
      logger.info("news.opinion.skip.irrelevant", { 
        articleId: article.id,
        relevance: opinion.relevanceScore 
      });
      return null;
    }

    // Format post text
    const text = this.formatPost(article, opinion);

    try {
      if (this.cfg.DRY_RUN) {
        logger.info("news.opinion.post.dryrun", { 
          articleId: article.id,
          text: text.slice(0, 100) 
        });
      } else {
        await this.socialPoster.post(text);
        logger.info("news.opinion.posted", { articleId: article.id });
      }

      this.lastPostedIds.add(article.id);

      return {
        article,
        opinion,
        postedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error("news.opinion.post.failed", { 
        articleId: article.id,
        error: err instanceof Error ? err.message : String(err) 
      });
      return null;
    }
  }

  private formatPost(article: NewsArticle, opinion: Opinion): string {
    const emoji = this.getToneEmoji(opinion.tone);
    const confidenceStr = opinion.confidence >= 0.8 ? "High confidence" : 
                          opinion.confidence >= 0.5 ? "Medium confidence" : 
                          "Low confidence";

    // Format: Emoji + Commentary + Article link + Confidence
    return `${emoji} ${opinion.commentary}

${article.url}

${confidenceStr} • ${opinion.tone.toUpperCase()}`;
  }

  private getToneEmoji(tone: Opinion["tone"]): string {
    const map: Record<Opinion["tone"], string> = {
      bullish: "📈",
      bearish: "📉",
      neutral: "⚖️",
      skeptical: "🤔",
      excited: "🚀",
    };
    return map[tone] || "💭";
  }
}

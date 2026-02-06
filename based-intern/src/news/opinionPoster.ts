import crypto from "crypto";
import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";
import type { NewsArticle } from "./fetcher.js";
import type { Opinion } from "./opinion.js";
import type { SocialPoster } from "../social/poster.js";
import { formatViralPost } from "../social/moltbook_engagement.js";
import { canonicalizeUrl } from "./fingerprint.js";

export interface NewsPost {
  article: NewsArticle;
  opinion: Opinion;
  postedAt: string;
  postId?: string; // X tweet ID or Moltbook post ID
}

export class NewsOpinionPoster {
  private lastPostedIds = new Set<string>();
  private lastPostedUrlFps = new Set<string>();

  constructor(
    private cfg: AppConfig,
    private socialPoster: SocialPoster,
    /** Pre-populated from state — all article IDs already posted by ANY pipeline */
    alreadyPostedIds?: Set<string>,
    /** Pre-populated from state — all URL fingerprints already posted by ANY pipeline */
    alreadyPostedUrlFps?: Set<string>
  ) {
    if (alreadyPostedIds) {
      for (const id of alreadyPostedIds) this.lastPostedIds.add(id);
    }
    if (alreadyPostedUrlFps) {
      for (const fp of alreadyPostedUrlFps) this.lastPostedUrlFps.add(fp);
    }
  }

  async post(article: NewsArticle, opinion: Opinion): Promise<NewsPost | null> {
    // Skip if already posted (by ID)
    if (this.lastPostedIds.has(article.id)) {
      logger.info("news.opinion.skip.duplicate_id", { articleId: article.id });
      return null;
    }

    // Skip if already posted (by URL fingerprint — catches cross-pipeline dupes)
    const urlFp = crypto.createHash("sha256").update(canonicalizeUrl(article.url)).digest("hex");
    if (this.lastPostedUrlFps.has(urlFp)) {
      logger.info("news.opinion.skip.duplicate_url", { articleId: article.id, url: article.url });
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

    // Format post text with viral formatting for Moltbook engagement
    const baseText = this.formatPost(article, opinion);
    const text = formatViralPost(baseText, "opinion");

    try {
      if (this.cfg.DRY_RUN) {
        logger.info("news.opinion.post.dryrun", { 
          articleId: article.id,
          text: text.slice(0, 100) 
        });
      } else {
        await this.socialPoster.post(text, 'opinion');
        logger.info("news.opinion.posted", { articleId: article.id });
      }

      this.lastPostedIds.add(article.id);
      this.lastPostedUrlFps.add(urlFp);

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
    const confidenceStr = opinion.confidence >= 0.8 ? "High conviction" : 
                          opinion.confidence >= 0.5 ? "Medium conviction" : 
                          "Watching closely";

    // Pick a random engagement closer for the opinion
    const closers = [
      "What's your read on this?",
      "Agree or nah? 👇",
      "How are you positioned?",
      "Reply with your take.",
      "Bullish or bearish?",
      "What am I missing?",
      "Where do you stand?",
    ];
    const closer = closers[Math.floor(Math.random() * closers.length)];

    // Format: Emoji + Commentary + Article link + Confidence + Closer + Signature
    return `${emoji} ${opinion.commentary}

${article.url}

${confidenceStr} • ${opinion.tone.toUpperCase()}

${closer}

— Based Intern 🤖`;
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

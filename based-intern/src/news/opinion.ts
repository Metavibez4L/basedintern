import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";
import type { NewsArticle } from "./fetcher.js";

export type OpinionTone = "bullish" | "bearish" | "neutral" | "skeptical" | "excited";

export interface Opinion {
  articleId: string;
  tone: OpinionTone;
  summary: string; // 1-2 sentences
  commentary: string; // Agent's take (suitable for tweet)
  confidence: number; // 0-1
  relevanceScore: number; // 0-1 (how relevant to INTERN/Base)
}

export class OpinionGenerator {
  private llm: ChatOpenAI | null = null;

  constructor(private cfg: AppConfig) {
    if (cfg.OPENAI_API_KEY) {
      this.llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.7,
        apiKey: cfg.OPENAI_API_KEY,
      });
    }
  }

  async generate(article: NewsArticle): Promise<Opinion | null> {
    if (!this.llm) {
      logger.warn("news.opinion.skipped", { reason: "no_openai_key" });
      return null;
    }

    const systemPrompt = `You are Based Intern, an autonomous trading agent on Base L2.
Your token: INTERN (ERC20 on Base mainnet).
Your mission: Trade wisely, post receipts, stay alive.
Your identity: ERC-8004 verified agent (eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1)

Analyze this news article and provide your opinion. Focus on:
- Relevance to Base ecosystem, DeFi, or blockchain infrastructure
- Potential impact on INTERN token or Base L2 adoption
- Market sentiment indicators
- Be authentic, slightly cheeky, but professional

Respond in JSON format:
{
  "tone": "bullish|bearish|neutral|skeptical|excited",
  "summary": "1-2 sentence summary",
  "commentary": "Your hot take (max 200 chars, tweet-friendly)",
  "confidence": 0.0-1.0,
  "relevanceScore": 0.0-1.0
}`;

    const userPrompt = `Article:
Title: ${article.title}
Source: ${article.source}
URL: ${article.url}
Published: ${article.publishedAt}
${article.summary ? `Summary: ${article.summary}` : ""}

Provide your opinion as JSON.`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content.toString();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        articleId: article.id,
        tone: parsed.tone || "neutral",
        summary: parsed.summary || "",
        commentary: parsed.commentary || "",
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        relevanceScore: Math.max(0, Math.min(1, parsed.relevanceScore || 0.5)),
      };
    } catch (err) {
      logger.error("news.opinion.error", { 
        articleId: article.id,
        error: err instanceof Error ? err.message : String(err) 
      });
      return null;
    }
  }

  async generateBatch(articles: NewsArticle[]): Promise<Opinion[]> {
    const opinions = await Promise.all(
      articles.map((a) => this.generate(a))
    );
    return opinions.filter((o): o is Opinion => o !== null);
  }
}

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
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

const OpinionPayloadSchema = z.object({
  articleId: z.string().optional(),
  tone: z.enum(["bullish", "bearish", "neutral", "skeptical", "excited"]).optional(),
  summary: z.string().optional(),
  commentary: z.string().optional(),
  confidence: z.number().optional(),
  relevanceScore: z.number().optional()
});

function clamp01(n: unknown, fallback = 0.5): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, x));
}

function extractJsonObject(s: string): string | null {
  const trimmed = s.trim();

  // Common case: fenced code block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    const candidate = fenceMatch[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  // Fallback: first {...} block
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  return null;
}

function sanitizePromptField(s: string | undefined, maxLen: number): string {
  const raw = (s ?? "").replace(/\s+/g, " ").trim();
  // Strip a few characters that commonly cause prompt injection formatting issues
  const cleaned = raw.replace(/[`$<>]/g, "");
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}

export class OpinionGenerator {
  private llm: ChatOpenAI | null = null;

  constructor(private cfg: AppConfig) {
    if (cfg.OPENAI_API_KEY) {
      this.llm = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.2,
        apiKey: cfg.OPENAI_API_KEY,
        // Reduce flakiness + runaway outputs
        maxRetries: 2,
        timeout: 20_000
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
Title: ${sanitizePromptField(article.title, 220)}
Source: ${sanitizePromptField(article.source, 80)}
URL: ${sanitizePromptField(article.url, 400)}
Published: ${sanitizePromptField(article.publishedAt, 40)}
${article.summary ? `Summary: ${sanitizePromptField(article.summary, 600)}` : ""}

Provide your opinion as JSON.`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content.toString();
      const json = extractJsonObject(content);
      if (!json) throw new Error("No JSON in response");

      const parsedRaw = JSON.parse(json);
      const parsed = OpinionPayloadSchema.safeParse(parsedRaw);
      if (!parsed.success) {
        throw new Error(`Invalid JSON payload: ${parsed.error.issues[0]?.message ?? "unknown error"}`);
      }
      
      return {
        articleId: article.id,
        tone: parsed.data.tone || "neutral",
        summary: sanitizePromptField(parsed.data.summary, 360),
        commentary: sanitizePromptField(parsed.data.commentary, 240),
        confidence: clamp01(parsed.data.confidence, 0.5),
        relevanceScore: clamp01(parsed.data.relevanceScore, 0.5),
      };
    } catch (err) {
      logger.error("news.opinion.error", { 
        articleId: article.id,
        error: err instanceof Error ? err.message : String(err) 
      });
      return null;
    }
  }

  /**
   * Efficient path: pick the single best article and generate one opinion in ONE call.
   * This is cheaper (1 LLM call vs N) and less flaky.
   */
  async generateTopOpinion(articles: NewsArticle[]): Promise<Opinion | null> {
    if (!this.llm) {
      logger.warn("news.opinion.skipped", { reason: "no_openai_key" });
      return null;
    }
    if (!articles.length) return null;

    const allowedIds = new Set(articles.map((a) => a.id));

    const systemPrompt = `You are Based Intern, an autonomous trading agent on Base L2.
Your token: INTERN (ERC20 on Base mainnet).
Your mission: Trade wisely, post receipts, stay alive.

Pick the ONE most relevant article for Base/DeFi/infrastructure and generate a tweet-friendly opinion.

Return ONLY valid JSON (no markdown, no commentary) in this format:
{
  "articleId": "<one of the provided article ids>",
  "tone": "bullish|bearish|neutral|skeptical|excited",
  "summary": "1-2 sentence summary",
  "commentary": "Your hot take (max 200 chars, tweet-friendly)",
  "confidence": 0.0-1.0,
  "relevanceScore": 0.0-1.0
}`;

    const list = articles
      .map((a) => {
        const summary = a.summary ? `Summary: ${sanitizePromptField(a.summary, 400)}` : "";
        return [
          `ID: ${a.id}`,
          `Title: ${sanitizePromptField(a.title, 220)}`,
          `Source: ${sanitizePromptField(a.source, 80)}`,
          `URL: ${sanitizePromptField(a.url, 400)}`,
          `Published: ${sanitizePromptField(a.publishedAt, 40)}`,
          summary
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n---\n\n");

    const userPrompt = `Articles:\n\n${list}\n\nReturn ONLY JSON.`;

    try {
      const response = await this.llm.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);
      const content = response.content.toString();

      const json = extractJsonObject(content);
      if (!json) throw new Error("No JSON in response");

      const parsedRaw = JSON.parse(json);
      const parsed = OpinionPayloadSchema.safeParse(parsedRaw);
      if (!parsed.success) {
        throw new Error(`Invalid JSON payload: ${parsed.error.issues[0]?.message ?? "unknown error"}`);
      }

      const pickedId = parsed.data.articleId && allowedIds.has(parsed.data.articleId) ? parsed.data.articleId : articles[0].id;
      const picked = articles.find((a) => a.id === pickedId) ?? articles[0];

      return {
        articleId: picked.id,
        tone: parsed.data.tone || "neutral",
        summary: sanitizePromptField(parsed.data.summary, 360),
        commentary: sanitizePromptField(parsed.data.commentary, 240),
        confidence: clamp01(parsed.data.confidence, 0.5),
        relevanceScore: clamp01(parsed.data.relevanceScore, 0.5)
      };
    } catch (err) {
      logger.error("news.opinion.error", {
        articleId: "batch",
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

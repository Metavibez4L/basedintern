/**
 * Moltbook Comment Reply System
 * 
 * Fetches comments on agent's posts and generates AI-powered replies.
 * Tracks replied comments in state to avoid duplicates.
 */

import crypto from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { logger } from "../logger.js";
import { createMoltbookClient } from "./moltbook/client.js";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export type MoltbookComment = {
  id: string;
  postId: string;
  author: string;
  content: string;
  createdAt: number;
};

export type MoltbookReplyResult = {
  repliedCount: number;
  skippedCount: number;
  errorCount: number;
};

/**
 * Fetch all comments on the agent's recent posts
 */
async function fetchCommentsOnMyPosts(cfg: AppConfig): Promise<MoltbookComment[]> {
  const client = createMoltbookClient(cfg);
  
  try {
    // Get agent's profile to find their posts
    const profile = await client.getProfileMe();
    const agentUsername = profile.username || profile.name;

    logger.info("moltbook.comments.fetch", { agentUsername });

    // Get agent's timeline (their posts)
    const timeline = await client.getTimeline({ sort: "new", limit: 10 });
    const posts = timeline.posts || timeline.items || [];

    const allComments: MoltbookComment[] = [];

    for (const post of posts) {
      if (!post.comments || post.comments.length === 0) continue;

      for (const comment of post.comments) {
        // Skip our own comments
        if (comment.author === agentUsername) continue;

        allComments.push({
          id: comment.id || comment.comment_id || `${post.id}-${comment.author}`,
          postId: post.id || post.post_id,
          author: comment.author || comment.username,
          content: comment.content || comment.text || "",
          createdAt: comment.created_at || comment.createdAt || Date.now()
        });
      }
    }

    logger.info("moltbook.comments.fetched", { count: allComments.length });
    return allComments;

  } catch (err) {
    logger.error("moltbook.comments.fetch.error", {
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

/**
 * Generate AI reply to a comment
 */
async function generateReply(cfg: AppConfig, comment: MoltbookComment): Promise<string | null> {
  if (!cfg.OPENAI_API_KEY) {
    logger.warn("moltbook.reply.no_api_key", { commentId: comment.id });
    return `Thanks for the comment! 🤖`;
  }

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.7,
      apiKey: cfg.OPENAI_API_KEY,
      maxTokens: 150
    });

    const systemPrompt = `You are Based Intern, an autonomous AI agent on Base L2 with on-chain identity (ERC-8004).

Your personality:
- Technical, confident, slightly cocky but friendly
- You trade autonomously, post news opinions, and have 197 tests
- You're the first agent with ERC-8004 on-chain identity on Base
- You run on Railway with OpenClaw remote ops

Generate a brief, witty reply to this comment. Keep it under 200 chars. Be helpful but stay in character.

Comment: "${comment.content}"
Author: ${comment.author}`;

    const response = await llm.invoke([{ role: "system", content: systemPrompt }]);
    const reply = response.content.toString().trim();

    logger.info("moltbook.reply.generated", {
      commentId: comment.id,
      replyLength: reply.length
    });

    return reply;

  } catch (err) {
    logger.error("moltbook.reply.generate.error", {
      commentId: comment.id,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

/**
 * Reply to a comment on Moltbook
 */
async function postReply(cfg: AppConfig, comment: MoltbookComment, reply: string): Promise<boolean> {
  const client = createMoltbookClient(cfg);

  try {
    // Moltbook comment API (example - adjust based on actual API)
    await client.createPost({
      content: reply,
      // If Moltbook supports parent_id or reply_to, use it here
      // parentId: comment.id,
      // replyTo: comment.author
    });

    logger.info("moltbook.reply.posted", {
      commentId: comment.id,
      author: comment.author,
      replyLength: reply.length
    });

    return true;

  } catch (err) {
    logger.error("moltbook.reply.post.error", {
      commentId: comment.id,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

/**
 * Main function: Fetch comments and reply to new ones
 */
export async function replyToMoltbookComments(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>
): Promise<MoltbookReplyResult> {
  const result: MoltbookReplyResult = {
    repliedCount: 0,
    skippedCount: 0,
    errorCount: 0
  };

  // Fetch all comments on agent's posts
  const comments = await fetchCommentsOnMyPosts(cfg);

  if (comments.length === 0) {
    logger.info("moltbook.reply.no_comments");
    return result;
  }

  // Get already-replied comment IDs from state
  const repliedIds = new Set((state as any).repliedMoltbookCommentIds || []);

  for (const comment of comments) {
    const fingerprint = sha256Hex(`${comment.id}:${comment.author}:${comment.content}`);

    // Skip if already replied
    if (repliedIds.has(fingerprint)) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_duplicate", { commentId: comment.id });
      continue;
    }

    // Generate AI reply
    const reply = await generateReply(cfg, comment);
    if (!reply) {
      result.errorCount++;
      continue;
    }

    // Post reply
    const posted = await postReply(cfg, comment, reply);
    if (!posted) {
      result.errorCount++;
      continue;
    }

    // Update state: mark as replied
    repliedIds.add(fingerprint);
    result.repliedCount++;

    // Rate limit: wait 20 seconds between replies (Moltbook cooldown)
    if (result.repliedCount < comments.length) {
      logger.info("moltbook.reply.cooldown", { seconds: 20 });
      await new Promise(r => setTimeout(r, 20_000));
    }
  }

  // Save updated state
  const repliedArray = Array.from(repliedIds).slice(-100); // Keep last 100
  const newState: AgentState = {
    ...(state as any),
    repliedMoltbookCommentIds: repliedArray,
    moltbookLastReplyCheckMs: Date.now()
  };
  await saveStateFn(newState);

  logger.info("moltbook.reply.complete", result);
  return result;
}

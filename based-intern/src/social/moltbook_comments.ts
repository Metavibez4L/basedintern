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
    const agentId = (profile as any).agent?.id || profile.id;
    const agentName = (profile as any).agent?.name || profile.name || profile.username;

    logger.info("moltbook.comments.fetch", { agentId, agentName });

    // Get agent's profile with recent posts
    const profileDetail = await client.request({
      method: "GET",
      path: "/agents/profile",
      query: { name: agentName }
    });
    
    const recentPosts = (profileDetail as any).recentPosts || [];
    logger.info("moltbook.comments.posts.found", { count: recentPosts.length });

    const allComments: MoltbookComment[] = [];

    // Fetch posts that have comments
    for (const post of recentPosts) {
      const commentCount = post.comment_count || 0;
      if (commentCount === 0) continue;

      logger.info("moltbook.comments.fetch_post", { postId: post.id, commentCount });

      // Fetch individual post to get comments
      const postDetail = await client.request({
        method: "GET",
        path: `/posts/${post.id}`
      });

      const comments = (postDetail as any).comments || [];
      
      for (const comment of comments) {
        // Skip our own comments
        const commentAuthorId = comment.author?.id || comment.author_id;
        if (commentAuthorId === agentId) continue;

        allComments.push({
          id: comment.id || `${post.id}-${comment.author?.name}`,
          postId: post.id,
          author: comment.author?.name || comment.author_id || "unknown",
          content: comment.content || comment.text || "",
          createdAt: comment.created_at ? new Date(comment.created_at).getTime() : Date.now()
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
    // Use /posts/{postId}/comments endpoint with parent_id for threaded replies
    await client.request({
      method: "POST",
      path: `/posts/${comment.postId}/comments`,
      body: {
        content: reply,
        parent_id: comment.id
      }
    });

    logger.info("moltbook.reply.posted", {
      commentId: comment.id,
      postId: comment.postId,
      author: comment.author,
      replyLength: reply.length
    });

    return true;

  } catch (err) {
    logger.error("moltbook.reply.post.error", {
      commentId: comment.id,
      postId: comment.postId,
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
  const repliedIds = new Set(state.repliedMoltbookCommentIds ?? []);

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
    ...state,
    repliedMoltbookCommentIds: repliedArray,
    moltbookLastReplyCheckMs: Date.now()
  };
  await saveStateFn(newState);

  logger.info("moltbook.reply.complete", result);
  return result;
}

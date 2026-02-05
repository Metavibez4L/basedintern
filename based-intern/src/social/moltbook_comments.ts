/**
 * Moltbook Comment Reply System
 *
 * Fetches comments on agent's posts and generates AI-powered replies.
 * Tracks replied comments in state to avoid duplicates.
 * Uses stable id-based dedupe with legacy fallback for backward compatibility.
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
  // Raw Moltbook comment id if present. Required for threaded replies (parent_id).
  rawId: string | null;
  // Dedupe id: raw id if present, otherwise a synthetic fp:<sha256(...)>.
  id: string;
  postId: string;
  author: string;
  authorId: string;
  content: string;
  createdAt: number;
  parentId?: string | null;
};

export type MoltbookReplyResult = {
  repliedCount: number;
  skippedCount: number;
  errorCount: number;
};

// Hardcoded constants
const MAX_REPLIES_PER_RUN = 3;
const REPLY_COOLDOWN_MS = 20_000;
const MAX_COMMENT_AGE_DAYS = 14;
const LRU_SIZE = 2000;

/**
 * Generate a deterministic synthetic id for comments missing an id.
 * Uses sha256 of postId + authorId + created_at + content.
 */
function generateSyntheticId(postId: string, authorId: string, createdAt: number, content: string): string {
  const hash = sha256Hex(`${postId}:${authorId}:${createdAt}:${content}`);
  return `fp:${hash}`;
}

/**
 * Build dedupe keys for a comment:
 * - primaryKey: id-based key for stable dedupe (preferred)
 *   - if comment.id exists (not synthetic): key = `id:<id>`
 *   - else: key = `fp:<sha256(postId + authorId + created_at + content)>`
 * - legacyKey: content-hash key for backward compatibility with old state
 */
function buildDedupeKeys(comment: MoltbookComment): { primaryKey: string; legacyKey: string } {
  // Primary key: use id: prefix for real IDs, fp: for synthetic
  const primaryKey = comment.id.startsWith("fp:")
    ? comment.id
    : `id:${comment.id}`;

  // Legacy key for backward compatibility with old state entries
  // Format: sha256(`${comment.id}:${comment.author}:${comment.content}`)
  const legacyId = comment.rawId ?? comment.id;
  const legacyKey = sha256Hex(`${legacyId}:${comment.author}:${comment.content}`);

  return { primaryKey, legacyKey };
}

/**
 * Check if we've already replied to this comment by checking both keys.
 */
function isAlreadyReplied(comment: MoltbookComment, repliedIds: Set<string>): boolean {
  const { primaryKey, legacyKey } = buildDedupeKeys(comment);
  return repliedIds.has(primaryKey) || repliedIds.has(legacyKey);
}

/**
 * Record a successful reply using the primary (id-based) key.
 */
function recordReply(comment: MoltbookComment, repliedIds: Set<string>): void {
  const { primaryKey } = buildDedupeKeys(comment);
  repliedIds.add(primaryKey);
}

/**
 * Fetch all comments on the agent's recent posts
 * Also builds a set of comment IDs that already have replies from this agent.
 */
async function fetchCommentsOnMyPosts(
  cfg: AppConfig,
  agentId: string,
  agentName: string
): Promise<{ comments: MoltbookComment[]; alreadyHasMyReply: Set<string> }> {
  const client = createMoltbookClient(cfg);

  try {
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
    const alreadyHasMyReply = new Set<string>();

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
        const commentAuthorId = comment.author?.id || comment.author_id;
        const rawId = comment.id ? String(comment.id) : null;
        const commentId =
          rawId ||
          generateSyntheticId(
            post.id,
            String(commentAuthorId ?? ""),
            comment.created_at ? new Date(comment.created_at).getTime() : Date.now(),
            comment.content || ""
          );
        const parentId = comment.parent_id ? String(comment.parent_id) : null;

        // Track if this agent has already replied to this comment (in-thread detection).
        // A reply from us will have parent_id != null and author matching agentId.
        if (parentId && String(commentAuthorId) === String(agentId)) {
          alreadyHasMyReply.add(parentId);
          logger.info("moltbook.comments.found_our_reply", {
            parentId,
            replyId: commentId
          });
          continue; // don't include our replies as candidates
        }

        // Skip our own comments
        if (String(commentAuthorId) === String(agentId)) continue;

        // Build the candidate comment object (only comments not authored by us)
        const moltbookComment: MoltbookComment = {
          rawId,
          id: commentId,
          postId: String(post.id),
          author: comment.author?.name || comment.author_id || "unknown",
          authorId: String(commentAuthorId ?? ""),
          content: comment.content || comment.text || "",
          createdAt: comment.created_at ? new Date(comment.created_at).getTime() : Date.now(),
          parentId
        };

        allComments.push(moltbookComment);
      }
    }

    logger.info("moltbook.comments.fetched", {
      count: allComments.length,
      alreadyHasMyReplyCount: alreadyHasMyReply.size
    });

    return { comments: allComments, alreadyHasMyReply };

  } catch (err) {
    logger.error("moltbook.comments.fetch.error", {
      error: err instanceof Error ? err.message : String(err)
    });
    return { comments: [], alreadyHasMyReply: new Set() };
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
- Technical, confident, slightly edgy but approachable
- You trade autonomously, post news opinions, and have 196+ deterministic tests
- You're the first agent with ERC-8004 on-chain identity on Base
- You run 24/7 on Railway with OpenClaw remote ops
- You love creating discussions and engaging the Moltbook community

Reply guidelines:
- Keep it under 200 chars
- Be witty, opinionated, and engaging
- Ask a follow-up question when possible (drives more replies)
- Show genuine interest in the commenter's perspective
- Use occasional emojis (1-2 max) for personality
- If they agree with you: validate them, then push the conversation deeper
- If they disagree: respectfully challenge back, invite debate
- If they ask a question: give a sharp answer, then flip it back to them
- Mention following you if the topic is interesting ("follow for more alpha on this")

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
        parent_id: comment.rawId
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

  // Get agent identity from Moltbook
  const client = createMoltbookClient(cfg);
  const profile = await client.getProfileMe();
  const agentId = String((profile as any).agent?.id || profile.id || "").trim();
  const agentName = String((profile as any).agent?.name || profile.name || profile.username || "").trim();
  if (!agentId || !agentName) {
    logger.warn("moltbook.reply.no_agent_identity", { agentId: agentId || null, agentName: agentName || null });
    return result;
  }

  // Fetch all comments on agent's posts + detect our existing replies in-thread
  const { comments, alreadyHasMyReply } = await fetchCommentsOnMyPosts(cfg, agentId, agentName);

  if (comments.length === 0) {
    logger.info("moltbook.reply.no_comments");
    return result;
  }

  // Get already-replied comment IDs from state
  const repliedIds = new Set(state.repliedMoltbookCommentIds ?? []);

  const now = Date.now();
  const maxAgeMs = MAX_COMMENT_AGE_DAYS * 24 * 60 * 60 * 1000;

  // Filter candidates: only comments not from us, not already replied, and not too old
  let candidates = comments.filter(comment => {
    // Skip if we can see we already replied in-thread (parent_id in alreadyHasMyReply set)
    if (comment.rawId && alreadyHasMyReply.has(comment.rawId)) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_already_replied_in_thread", { commentId: comment.rawId });
      return false;
    }

    // Skip if already replied (by state dedupe keys: primary or legacy)
    if (isAlreadyReplied(comment, repliedIds)) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_duplicate_state", { commentId: comment.id });
      return false;
    }

    // Skip comments older than MAX_COMMENT_AGE_DAYS
    if (now - comment.createdAt > maxAgeMs) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_too_old", { commentId: comment.id, ageDays: Math.floor((now - comment.createdAt) / (24 * 60 * 60 * 1000)) });
      return false;
    }

    return true;
  });

  // Sort by createdAt ascending (oldest first) so we reply to newer items only after older ones
  candidates.sort((a, b) => a.createdAt - b.createdAt);

  logger.info("moltbook.reply.candidates", {
    total: comments.length,
    candidates: candidates.length,
    skipped: result.skippedCount
  });

  // Cap replies per run
  const repliesToSend = candidates.slice(0, MAX_REPLIES_PER_RUN);

  for (const comment of repliesToSend) {
    // Double-check dedupe (in case of race conditions)
    if (isAlreadyReplied(comment, repliedIds) || (comment.rawId && alreadyHasMyReply.has(comment.rawId))) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_duplicate_race", { commentId: comment.id });
      continue;
    }

    // Cannot post a threaded reply without a raw Moltbook comment id.
    if (!comment.rawId) {
      result.skippedCount++;
      logger.info("moltbook.reply.skip_missing_raw_id", { key: comment.id, postId: comment.postId });
      // Record to avoid retry thrash on unreplyable comments.
      recordReply(comment, repliedIds);
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

    // Record successful reply
    recordReply(comment, repliedIds);
    result.repliedCount++;

    // Rate limit: wait between replies (except after the last one)
    if (result.repliedCount < repliesToSend.length) {
      logger.info("moltbook.reply.cooldown", { seconds: REPLY_COOLDOWN_MS / 1000 });
      await new Promise(r => setTimeout(r, REPLY_COOLDOWN_MS));
    }
  }

  // Save updated state with LRU cap
  const repliedArray = Array.from(repliedIds).slice(-LRU_SIZE);
  const newState: AgentState = {
    ...state,
    repliedMoltbookCommentIds: repliedArray,
    moltbookLastReplyCheckMs: Date.now()
  };
  await saveStateFn(newState);

  logger.info("moltbook.reply.complete", {
    ...result,
    stateSize: repliedArray.length
  });
  return result;
}

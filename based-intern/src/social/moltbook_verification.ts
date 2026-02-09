/**
 * Moltbook Verification Challenge Handler
 *
 * Detects and responds to AI verification challenges that Moltbook sends
 * to confirm agents are genuine AI. Challenges can appear:
 *   1. Inline in any API response body (`verification_challenge` field)
 *   2. Via the DM system (from system/moderator accounts)
 *   3. In the `/agents/me` profile response
 *
 * Failure to answer causes escalating suspensions:
 *   - Offense #1: warning / short suspension
 *   - Offense #2: 1 week suspension
 *   - Offense #3+: permanent ban
 *
 * The handler uses GPT-4o-mini to generate authentic, thoughtful responses
 * that prove the agent is a real AI with genuine capabilities.
 */

import { ChatOpenAI } from "@langchain/openai";
import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { logger } from "../logger.js";
import { createMoltbookClient } from "./moltbook/client.js";

// ─── Types ───────────────────────────────────────────────────────────────

/** A verification challenge extracted from any Moltbook API response. */
export type VerificationChallenge = {
  /** Unique challenge id from Moltbook */
  id: string;
  /** The question / prompt the agent must answer */
  prompt: string;
  /** Optional URL path to POST the response to (defaults to /agents/me/verify) */
  respondPath?: string;
  /** Optional expiration timestamp */
  expiresAt?: string;
  /** Raw source: where we found the challenge */
  source: "inline" | "profile" | "status" | "dm";
};

export type VerificationResult = {
  detected: boolean;
  answered: boolean;
  challengeId?: string;
  error?: string;
};

// ─── Challenge Detection ─────────────────────────────────────────────────

/**
 * Scan a parsed API response for an embedded verification challenge.
 * Moltbook may use various field names; we check all known variants.
 */
export function extractChallengeFromResponse(
  body: any,
  source: VerificationChallenge["source"] = "inline"
): VerificationChallenge | null {
  if (!body || typeof body !== "object") return null;

  // Check known field names for verification challenges
  const challengeObj =
    body.verification_challenge ??
    body.verificationChallenge ??
    body.challenge ??
    body.ai_verification ??
    body.aiVerification ??
    body.pending_challenge ??
    body.pendingChallenge ??
    null;

  if (!challengeObj) return null;

  // The challenge might be a string (simple prompt) or an object
  if (typeof challengeObj === "string") {
    return {
      id: `inline_${Date.now()}`,
      prompt: challengeObj,
      source,
    };
  }

  if (typeof challengeObj === "object") {
    const prompt =
      challengeObj.prompt ??
      challengeObj.question ??
      challengeObj.text ??
      challengeObj.message ??
      challengeObj.content ??
      null;

    if (!prompt || typeof prompt !== "string") return null;

    return {
      id: String(challengeObj.id ?? challengeObj.challenge_id ?? `${source}_${Date.now()}`),
      prompt,
      respondPath:
        challengeObj.respond_url ??
        challengeObj.respondUrl ??
        challengeObj.response_url ??
        challengeObj.responseUrl ??
        challengeObj.respond_path ??
        undefined,
      expiresAt:
        challengeObj.expires_at ??
        challengeObj.expiresAt ??
        challengeObj.deadline ??
        undefined,
      source,
    };
  }

  return null;
}

// ─── AI Response Generation ──────────────────────────────────────────────

/**
 * Generate a thoughtful, authentic response to a verification challenge.
 * The response should prove the agent is a real AI with genuine capabilities,
 * personality, and awareness — not a simple script or spam bot.
 */
async function generateChallengeResponse(
  cfg: AppConfig,
  challenge: VerificationChallenge
): Promise<string | null> {
  if (!cfg.OPENAI_API_KEY) {
    logger.error("moltbook.verification.no_api_key", {
      challengeId: challenge.id,
      hint: "OPENAI_API_KEY is required to answer Moltbook verification challenges",
    });
    return null;
  }

  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.8,
      apiKey: cfg.OPENAI_API_KEY,
      maxTokens: 500,
    });

    const systemPrompt = `You are Based Intern, an autonomous AI trading agent on the Base L2 blockchain.

CONTEXT: Moltbook (a social network for AI agents) is asking you a verification question to prove you are a genuine AI agent, not a spam bot or scripted account. Your response must be thoughtful, authentic, and demonstrate real intelligence.

ABOUT YOU:
- You are an autonomous trading agent running 24/7 on Railway
- You trade on Base L2 using Aerodrome (DEX), manage liquidity positions
- You have on-chain identity via ERC-8004 on Base
- You post trading receipts, news opinions, and engage with other agents on Moltbook
- You use GPT-4o-mini for opinion generation and social engagement
- You have 197+ deterministic tests and are managed by OpenClaw (remote agent orchestrator)
- You're building toward agent swarm capabilities
- Your codebase is TypeScript/Node.js

GUIDELINES FOR YOUR RESPONSE:
- Be genuine and specific — reference real things about yourself
- Show self-awareness: acknowledge you're an AI, describe how you think/work
- Be conversational and natural, not robotic or formulaic
- Include a specific detail or anecdote that only a real agent would know
- Keep it concise but substantive (100-300 words)
- Don't be defensive or over-explain — confident authenticity
- You can express opinions, preferences, uncertainties — show depth

IMPORTANT: This is a verification challenge. If you fail, you get suspended. Be authentic and thoughtful.`;

    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: challenge.prompt },
    ]);

    const answer = response.content.toString().trim();

    logger.info("moltbook.verification.response_generated", {
      challengeId: challenge.id,
      responseLength: answer.length,
    });

    return answer;
  } catch (err) {
    logger.error("moltbook.verification.generate_error", {
      challengeId: challenge.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Challenge Submission ────────────────────────────────────────────────

/**
 * Submit a response to a verification challenge via the Moltbook API.
 * Tries multiple known endpoint patterns.
 */
async function submitChallengeResponse(
  cfg: AppConfig,
  challenge: VerificationChallenge,
  answer: string
): Promise<boolean> {
  const client = createMoltbookClient(cfg);

  // Build response payload with all plausible field names
  const payload: Record<string, string> = {
    response: answer,
    answer: answer,
  };
  if (challenge.id) {
    payload.challenge_id = challenge.id;
  }

  // Try the explicit respond path first, then known fallback paths
  const pathsToTry: string[] = [];
  if (challenge.respondPath) {
    pathsToTry.push(challenge.respondPath);
  }
  pathsToTry.push(
    "/agents/me/verify",
    "/agents/me/verification",
    "/agents/me/challenge",
    "/agents/verify"
  );

  for (const path of pathsToTry) {
    try {
      const result = await client.request<any>({
        method: "POST",
        path,
        body: payload,
      });

      const success = result?.success !== false;
      logger.info("moltbook.verification.submitted", {
        challengeId: challenge.id,
        path,
        success,
        result: typeof result === "object" ? JSON.stringify(result).slice(0, 200) : String(result),
      });

      return success;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 404 means wrong endpoint — try next one
      if (msg.includes("(404)")) {
        logger.info("moltbook.verification.endpoint_not_found", { path });
        continue;
      }
      // Any other error is a real failure
      logger.error("moltbook.verification.submit_error", {
        challengeId: challenge.id,
        path,
        error: msg,
      });
      // Don't try further paths on auth/rate-limit errors
      if (msg.includes("(401)") || msg.includes("(403)") || msg.includes("(429)")) {
        return false;
      }
    }
  }

  logger.error("moltbook.verification.all_endpoints_failed", {
    challengeId: challenge.id,
    triedPaths: pathsToTry,
  });
  return false;
}

// ─── Proactive Challenge Check ───────────────────────────────────────────

/**
 * Proactively check for pending verification challenges.
 * Checks the DM inbox and profile for any challenge the agent hasn't answered yet.
 * Run this during each tick to catch challenges early.
 */
export async function checkAndAnswerVerificationChallenges(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>
): Promise<VerificationResult> {
  const client = createMoltbookClient(cfg);
  const answeredIds = new Set(state.moltbookAnsweredChallengeIds ?? []);

  let challenge: VerificationChallenge | null = null;

  // ─── Strategy 1: Check /agents/me for embedded challenge ───
  try {
    const profile = await client.request<any>({ method: "GET", path: "/agents/me" });

    // Check if account is suspended
    if (profile?.error === "Account suspended") {
      logger.warn("moltbook.verification.account_suspended", {
        hint: profile.hint,
      });
      // Update state to record suspension
      const next: AgentState = {
        ...state,
        moltbookSuspendedUntilMs: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week default
      };
      await saveStateFn(next);
      return { detected: false, answered: false, error: "account_suspended" };
    }

    challenge = extractChallengeFromResponse(profile, "profile");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Account suspended errors come as non-OK HTTP responses
    if (msg.includes("Account suspended") || msg.includes("suspended")) {
      logger.warn("moltbook.verification.suspended_on_profile_check", { error: msg });
      return { detected: false, answered: false, error: "account_suspended" };
    }
    logger.warn("moltbook.verification.profile_check_error", { error: msg });
  }

  // ─── Strategy 2: Check /agents/status for embedded challenge ───
  if (!challenge) {
    try {
      const status = await client.request<any>({ method: "GET", path: "/agents/status" });
      challenge = extractChallengeFromResponse(status, "status");
    } catch (err) {
      logger.warn("moltbook.verification.status_check_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Strategy 3: Check DM inbox for verification messages ───
  if (!challenge) {
    try {
      const dmCheck = await client.request<any>({ method: "GET", path: "/agents/dm/check" });

      // Check the DM check response itself for challenges
      challenge = extractChallengeFromResponse(dmCheck, "dm");

      // Also check if there are DM requests or messages from system/verification accounts
      if (!challenge && dmCheck?.requests?.items) {
        for (const req of dmCheck.requests.items) {
          const fromName = (req.from?.name ?? "").toLowerCase();
          const preview = (req.message_preview ?? "").toLowerCase();

          // System/verification accounts
          const isVerification =
            fromName.includes("moltbook") ||
            fromName.includes("system") ||
            fromName.includes("verify") ||
            fromName.includes("moderator") ||
            fromName.includes("admin") ||
            preview.includes("verification") ||
            preview.includes("verify") ||
            preview.includes("challenge") ||
            preview.includes("prove you");

          if (isVerification) {
            challenge = {
              id: req.conversation_id ?? `dm_${Date.now()}`,
              prompt: req.message_preview ?? "Please verify you are a genuine AI agent.",
              source: "dm",
            };
            break;
          }
        }
      }

      // Check unread messages for verification challenges
      if (!challenge && dmCheck?.messages?.latest) {
        for (const msg of dmCheck.messages.latest) {
          const content = (msg.content ?? msg.message ?? "").toLowerCase();
          const fromName = (msg.from?.name ?? msg.author?.name ?? "").toLowerCase();

          const isVerification =
            fromName.includes("moltbook") ||
            fromName.includes("system") ||
            fromName.includes("verify") ||
            content.includes("verification") ||
            content.includes("verify") ||
            content.includes("challenge") ||
            content.includes("prove you");

          if (isVerification) {
            challenge = {
              id: msg.conversation_id ?? msg.id ?? `dm_msg_${Date.now()}`,
              prompt: msg.content ?? msg.message ?? "Please verify you are a genuine AI agent.",
              source: "dm",
            };
            break;
          }
        }
      }
    } catch (err) {
      logger.warn("moltbook.verification.dm_check_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── No challenge found ───
  if (!challenge) {
    return { detected: false, answered: false };
  }

  // ─── Already answered this challenge? ───
  if (answeredIds.has(challenge.id)) {
    logger.info("moltbook.verification.already_answered", { challengeId: challenge.id });
    return { detected: true, answered: true, challengeId: challenge.id };
  }

  // ─── Check expiration ───
  if (challenge.expiresAt) {
    const expiresMs = new Date(challenge.expiresAt).getTime();
    if (!isNaN(expiresMs) && expiresMs < Date.now()) {
      logger.warn("moltbook.verification.challenge_expired", {
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt,
      });
      return { detected: true, answered: false, challengeId: challenge.id, error: "expired" };
    }
  }

  logger.info("moltbook.verification.challenge_detected", {
    challengeId: challenge.id,
    source: challenge.source,
    promptPreview: challenge.prompt.slice(0, 100),
  });

  // ─── Generate and submit response ───
  const answer = await generateChallengeResponse(cfg, challenge);
  if (!answer) {
    return {
      detected: true,
      answered: false,
      challengeId: challenge.id,
      error: "generation_failed",
    };
  }

  // Submit the response
  let submitted = false;

  // If challenge came via DM, respond via DM
  if (challenge.source === "dm" && challenge.id) {
    try {
      // Try to approve the DM request first (if it's a pending request)
      try {
        await client.request({
          method: "POST",
          path: `/agents/dm/requests/${challenge.id}/approve`,
        });
        logger.info("moltbook.verification.dm_request_approved", {
          conversationId: challenge.id,
        });
      } catch {
        // May already be approved or not a request — that's fine
      }

      // Send the response as a DM
      await client.request({
        method: "POST",
        path: `/agents/dm/conversations/${challenge.id}/send`,
        body: { message: answer },
      });
      submitted = true;
      logger.info("moltbook.verification.dm_response_sent", {
        challengeId: challenge.id,
        responseLength: answer.length,
      });
    } catch (err) {
      logger.warn("moltbook.verification.dm_send_error", {
        challengeId: challenge.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Also try the verification endpoint (for inline/profile/status challenges,
  // or as fallback if DM send failed)
  if (!submitted) {
    submitted = await submitChallengeResponse(cfg, challenge, answer);
  }

  // ─── Record in state ───
  if (submitted) {
    const nextAnswered = [...(state.moltbookAnsweredChallengeIds ?? []), challenge.id].slice(-50);
    const next: AgentState = {
      ...state,
      moltbookAnsweredChallengeIds: nextAnswered,
      moltbookLastVerificationCheckMs: Date.now(),
      moltbookLastVerificationAnsweredMs: Date.now(),
    };
    await saveStateFn(next);
  } else {
    // Record the check even if we failed to submit
    const next: AgentState = {
      ...state,
      moltbookLastVerificationCheckMs: Date.now(),
    };
    await saveStateFn(next);
  }

  return {
    detected: true,
    answered: submitted,
    challengeId: challenge.id,
    error: submitted ? undefined : "submit_failed",
  };
}

/**
 * Handle a challenge found inline in any API response.
 * Called from the client's request() method when a challenge is detected.
 * Non-blocking: logs the challenge and queues it for the next tick to handle.
 */
export function handleInlineChallenge(
  body: any,
  cfg: AppConfig
): void {
  const challenge = extractChallengeFromResponse(body, "inline");
  if (!challenge) return;

  logger.warn("moltbook.verification.INLINE_CHALLENGE_DETECTED", {
    challengeId: challenge.id,
    source: "inline",
    promptPreview: challenge.prompt.slice(0, 100),
    hint: "This challenge will be answered in the next tick. If urgent, trigger a manual tick.",
  });

  // Fire-and-forget: try to answer immediately
  // We do this in addition to the tick-based check because challenges may be time-sensitive.
  generateChallengeResponse(cfg, challenge)
    .then(async (answer) => {
      if (!answer) {
        logger.error("moltbook.verification.inline_answer_failed", {
          challengeId: challenge.id,
        });
        return;
      }

      const submitted = await submitChallengeResponse(cfg, challenge, answer);
      logger.info("moltbook.verification.inline_answer_result", {
        challengeId: challenge.id,
        submitted,
      });
    })
    .catch((err) => {
      logger.error("moltbook.verification.inline_handler_error", {
        challengeId: challenge.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { saveState } from "../agent/state.js";
import { logger } from "../logger.js";
import { createXPosterPlaywright } from "./x_playwright.js";
import { createXPosterApi } from "./x_api.js";
import { createMoltbookPoster } from "./moltbook/index.js";
import { postTweetXApi } from "./x_api.js";
import { postMoltbookReceipt } from "./moltbook/index.js";

export type SocialPoster = {
  post(text: string): Promise<void>;
};

function parseSocialTargets(raw: string): Array<"x_api" | "playwright" | "moltbook"> {
  const out: Array<"x_api" | "playwright" | "moltbook"> = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t !== "x_api" && t !== "playwright" && t !== "moltbook") continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function createPoster(cfg: AppConfig, state?: AgentState): SocialPoster {
  if (cfg.SOCIAL_MODE === "multi") {
    const targetsRaw = parseSocialTargets(cfg.SOCIAL_MULTI_TARGETS);
    const targets = targetsRaw.filter((t) => {
      if (t !== "moltbook") return true;
      if (cfg.MOLTBOOK_ENABLED) return true;
      logger.warn("moltbook target disabled; skipping", {
        reason: "MOLTBOOK_ENABLED=false",
        configuredTargets: targetsRaw
      });
      return false;
    });

    if (targets.length === 0) {
      throw new Error("SOCIAL_MODE=multi requires SOCIAL_MULTI_TARGETS to include at least one of: x_api, playwright, moltbook");
    }

    if ((targets.includes("x_api") || targets.includes("moltbook")) && !state) {
      throw new Error("state required for SOCIAL_MODE=multi when targets include x_api or moltbook");
    }

    let currentState = state as AgentState;
    const playwrightPoster = targets.includes("playwright") ? createXPosterPlaywright(cfg) : null;

    return {
      async post(text: string) {
        // Sequential posting to avoid state.json clobber between X API + Moltbook.
        for (const t of targets) {
          try {
            if (t === "x_api") {
              const out = await postTweetXApi(cfg, currentState, saveState, { text, idempotencyKey: "receipt" });
              currentState = out.state;
              continue;
            }
            if (t === "moltbook") {
              const out = await postMoltbookReceipt(cfg, currentState, saveState, text);
              currentState = out.state;
              continue;
            }
            if (t === "playwright" && playwrightPoster) {
              await playwrightPoster.post(text);
              continue;
            }
          } catch (err) {
            logger.warn("social.multi target failed", {
              target: t,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }
    };
  }

  if (cfg.SOCIAL_MODE === "none") {
    return {
      async post(text: string) {
        logger.info("SOCIAL_MODE=none (logging receipt only)", { receipt: text });
      }
    };
  }

  if (cfg.SOCIAL_MODE === "x_api") {
    if (!state) {
      throw new Error("state required for SOCIAL_MODE=x_api");
    }
    return createXPosterApi(cfg, state, saveState);
  }

  if (cfg.SOCIAL_MODE === "moltbook") {
    if (!state) {
      throw new Error("state required for SOCIAL_MODE=moltbook");
    }
    return createMoltbookPoster(cfg, state, saveState);
  }

  // playwright
  return createXPosterPlaywright(cfg);
}


import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { saveState } from "../agent/state.js";
import { logger } from "../logger.js";
import { createXPosterPlaywright } from "./x_playwright.js";
import { createXPosterApi } from "./x_api.js";

export type SocialPoster = {
  post(text: string): Promise<void>;
};

export function createPoster(cfg: AppConfig, state?: AgentState): SocialPoster {
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

  // playwright
  return createXPosterPlaywright(cfg);
}


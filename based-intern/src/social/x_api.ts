import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { SocialPoster } from "./poster.js";

/**
 * Optional/experimental: X API posting.
 *
 * This is scaffolded only; Playwright is the default in this repo.
 */
export function createXPosterApi(_cfg: AppConfig): SocialPoster {
  return {
    async post(text: string) {
      logger.warn("SOCIAL_MODE=x_api is not implemented; falling back to log-only.", { receipt: text });
    }
  };
}


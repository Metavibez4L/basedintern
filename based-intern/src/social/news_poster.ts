import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { logger } from "../logger.js";
import { postTweetXApi } from "./x_api.js";

export type NewsPostResult = {
  posted: boolean;
  state: AgentState;
  reason?: string;
};

export async function postNewsTweet(
  cfg: AppConfig,
  state: AgentState,
  saveStateFn: (s: AgentState) => Promise<void>,
  text: string
): Promise<NewsPostResult> {
  if (cfg.SOCIAL_MODE === "none") {
    logger.info("news.post (SOCIAL_MODE=none)", { text });
    return { posted: true, state };
  }

  if (cfg.SOCIAL_MODE !== "x_api") {
    logger.warn("news.skip (unsupported SOCIAL_MODE)", { socialMode: cfg.SOCIAL_MODE });
    return { posted: false, state, reason: "unsupported social mode" };
  }

  const out = await postTweetXApi(cfg, state, saveStateFn, {
    text,
    idempotencyKey: "news"
  });

  return { posted: out.posted, state: out.state, reason: out.posted ? undefined : "x_api not posted" };
}

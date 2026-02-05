import type { AppConfig } from "../config.js";
import type { AgentState } from "../agent/state.js";
import { saveState } from "../agent/state.js";
import { logger } from "../logger.js";
import { createXPosterPlaywright } from "./x_playwright.js";
import { createXPosterApi } from "./x_api.js";
import { createMoltbookPoster } from "./moltbook/index.js";
import { postTweetXApi } from "./x_api.js";
import { postMoltbookReceipt, postMoltbookText } from "./moltbook/index.js";

export type SocialPostKind = "receipt" | "news" | "opinion" | "meta";

export type SocialPoster = {
  post(text: string, kind?: SocialPostKind): Promise<void>;
};

let warnedMoltbookImplicitEnable = false;
let warnedPlaywrightWithXApi = false;

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
    let targets = targetsRaw.filter((t) => {
      if (t !== "moltbook") return true;
      if (cfg.MOLTBOOK_ENABLED) return true;

      const rawEnvEnabled = process.env.MOLTBOOK_ENABLED;
      const hasEnvVar = Object.hasOwn(process.env, "MOLTBOOK_ENABLED");
      const hasApiKeyEnvVar = Object.hasOwn(process.env, "MOLTBOOK_API_KEY") && Boolean(process.env.MOLTBOOK_API_KEY);
      const moltbookEnvKeys = Object.keys(process.env)
        .filter((k) => k.toUpperCase().startsWith("MOLTBOOK_"))
        .sort();

      // Railway edge case: sometimes a single variable doesn't get injected even when others do.
      // If the explicit enable flag is missing but an API key exists, treat Moltbook as enabled.
      // This preserves the default-off behavior while preventing confusing partial-config failures.
      if (!hasEnvVar && hasApiKeyEnvVar) {
        if (!warnedMoltbookImplicitEnable) {
          warnedMoltbookImplicitEnable = true;
          logger.warn("MOLTBOOK_ENABLED missing; enabling moltbook implicitly because MOLTBOOK_API_KEY is present", {
            configuredTargets: targetsRaw,
            env: {
              hasEnvVar,
              rawEnabled: rawEnvEnabled ?? null,
              hasApiKeyEnvVar,
              presentKeys: moltbookEnvKeys,
              nodeEnv: process.env.NODE_ENV ?? null,
              cwd: process.cwd()
            }
          });
        }
        return true;
      }

      logger.warn("moltbook target disabled; skipping", {
        reason: hasEnvVar ? "MOLTBOOK_ENABLED=false" : "MOLTBOOK_ENABLED missing",
        configuredTargets: targetsRaw,
        env: {
          hasEnvVar,
          rawEnabled: rawEnvEnabled ?? null,
          hasApiKeyEnvVar,
          presentKeys: moltbookEnvKeys,
          nodeEnv: process.env.NODE_ENV ?? null,
          cwd: process.cwd()
        }
      });
      return false;
    });

    // Avoid duplicate X posts: if x_api is configured, don't also post to X via playwright.
    if (targets.includes("x_api") && targets.includes("playwright")) {
      if (!warnedPlaywrightWithXApi) {
        warnedPlaywrightWithXApi = true;
        logger.warn("SOCIAL_MULTI_TARGETS includes both x_api and playwright; skipping playwright to avoid duplicate X posts", {
          configuredTargets: targetsRaw
        });
      }
      targets = targets.filter((t) => t !== "playwright");
    }

    if (targets.length === 0) {
      throw new Error("SOCIAL_MODE=multi requires SOCIAL_MULTI_TARGETS to include at least one of: x_api, playwright, moltbook");
    }

    if ((targets.includes("x_api") || targets.includes("moltbook")) && !state) {
      throw new Error("state required for SOCIAL_MODE=multi when targets include x_api or moltbook");
    }

    let currentState = state as AgentState;
    const playwrightPoster = targets.includes("playwright") ? createXPosterPlaywright(cfg) : null;

    return {
      async post(text: string, kind: SocialPostKind = "receipt") {
        // Sequential posting to avoid state.json clobber between X API + Moltbook.
        for (const t of targets) {
          try {
            if (t === "x_api") {
              const idempotencyKey = kind === "receipt" ? "receipt" : "news";
              const out = await postTweetXApi(cfg, currentState, saveState, { text, idempotencyKey });
              currentState = out.state;
              continue;
            }
            if (t === "moltbook") {
              const out =
                kind === "receipt"
                  ? await postMoltbookReceipt(cfg, currentState, saveState, text)
                  : await postMoltbookText(cfg, currentState, saveState, { text, kind });
              currentState = out.state;

              if (!out.posted) {
                logger.warn("social.multi moltbook did not post", {
                  reason: out.reason ?? null,
                  dryRun: cfg.DRY_RUN
                });
              }
              continue;
            }
            if (t === "playwright" && playwrightPoster) {
              await playwrightPoster.post(text, kind);
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
      async post(text: string, kind?: SocialPostKind) {
        logger.info("SOCIAL_MODE=none (logging receipt only)", { receipt: text, kind });
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

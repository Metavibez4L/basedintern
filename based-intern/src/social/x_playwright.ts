import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { SocialPoster } from "./poster.js";

export function createXPosterPlaywright(cfg: AppConfig): SocialPoster {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  async function ensurePage(): Promise<Page> {
    if (page) return page;

    browser = await chromium.launch({ headless: cfg.HEADLESS });

    const storageState = await maybeLoadCookies(cfg.X_COOKIES_PATH);
    context = await browser.newContext(storageState ? { storageState } : undefined);
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return page;
  }

  async function reset(): Promise<void> {
    try {
      await context?.close();
    } catch {
      // ignore
    }
    try {
      await browser?.close();
    } catch {
      // ignore
    }
    browser = null;
    context = null;
    page = null;
  }

  async function postOnce(text: string): Promise<void> {
    const p = await ensurePage();
    await p.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

    const loggedIn = await isLoggedIn(p);
    if (!loggedIn) {
      await loginIfPossible(p, cfg);
    }

    await composeAndPost(p, text);
  }

  return {
    async post(text: string) {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await postOnce(text);
          logger.info("posted to X (playwright)", { attempt });
          return;
        } catch (err) {
          logger.warn("failed to post to X (playwright)", {
            attempt,
            error: err instanceof Error ? err.message : String(err)
          });
          await reset();
          await sleep(backoffMs(attempt));
        }
      }
      // Give up for this tick; keep agent running.
      logger.error("giving up posting to X for this tick", {});
    }
  };
}

type NewContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;
type StorageStateArg = NewContextOptions["storageState"];
type StorageStateObject = Exclude<StorageStateArg, string | undefined>;

async function maybeLoadCookies(p: string | undefined): Promise<StorageStateObject | undefined> {
  if (!p) return undefined;
  try {
    const raw = await readFile(p, "utf8");
    const json = JSON.parse(raw) as unknown;

    // Allow either Playwright storageState object, or a raw cookies[] array.
    if (Array.isArray(json)) {
      // Cookie shape isn't validated here; Playwright will accept/ignore unknown fields.
      return { cookies: json as any, origins: [] } as StorageStateObject;
    }

    if (json && typeof json === "object") {
      return json as StorageStateObject;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // Heuristic: presence of compose box or “Post” button.
  const compose = page.locator('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetTextarea_0"]');
  return (await compose.count()) > 0;
}

async function loginIfPossible(page: Page, cfg: AppConfig): Promise<void> {
  if (!cfg.X_USERNAME || !cfg.X_PASSWORD) {
    throw new Error("not logged in and X_USERNAME/X_PASSWORD not set (try cookies via X_COOKIES_PATH)");
  }

  logger.info("attempting X login (username/password)", {});
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" });

  // X login flow changes often; keep selectors flexible and prefer flow testids.
  const usernameInput = page
    .locator(
      [
        'input[data-testid="ocfEnterTextTextInput"]',
        'input[name="text"]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]'
      ].join(", ")
    )
    .first();

  await usernameInput.waitFor({ timeout: 30_000 });
  await usernameInput.fill(cfg.X_USERNAME);

  const nextBtn = page
    .locator(
      [
        '[data-testid="ocfEnterTextNextButton"]',
        '[data-testid="LoginForm_Login_Button"]',
        'div[role="button"]:has-text("Next")'
      ].join(", ")
    )
    .first();

  if ((await nextBtn.count()) > 0) await nextBtn.click();
  else await page.keyboard.press("Enter");

  // Some accounts see an extra challenge step (email/phone). Best-effort: proceed if it appears.
  for (let i = 0; i < 2; i++) {
    const maybeChallenge = page.locator('input[data-testid="ocfEnterTextTextInput"]').first();
    if ((await maybeChallenge.count()) > 0) {
      await maybeChallenge.fill(cfg.X_USERNAME);
      const challengeNext = page.locator('[data-testid="ocfEnterTextNextButton"]').first();
      if ((await challengeNext.count()) > 0) await challengeNext.click();
      else await page.keyboard.press("Enter");
    }

    const pw = page
      .locator('input[data-testid="ocfEnterPasswordTextInput"], input[name="password"], input[autocomplete="current-password"]')
      .first();
    if ((await pw.count()) > 0) break;
    await page.waitForTimeout(1_000);
  }

  // password step
  const passwordInput = page
    .locator('input[data-testid="ocfEnterPasswordTextInput"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  await passwordInput.waitFor({ timeout: 30_000 });
  await passwordInput.fill(cfg.X_PASSWORD);

  const loginBtn = page
    .locator(
      ['[data-testid="ocfEnterPasswordNextButton"]', 'div[role="button"]:has-text("Log in")', 'div[role="button"]:has-text("Login")'].join(
        ", "
      )
    )
    .first();
  if ((await loginBtn.count()) > 0) await loginBtn.click();
  else await page.keyboard.press("Enter");

  // allow redirect
  await page.waitForTimeout(5_000);
}

async function composeAndPost(page: Page, text: string): Promise<void> {
  // Open composer
  const newTweet = page.locator('[data-testid="SideNav_NewTweet_Button"]');
  if ((await newTweet.count()) > 0) {
    await newTweet.first().click();
  }

  const textbox = page.locator('[data-testid="tweetTextarea_0"], div[role="textbox"]').first();
  await textbox.click();
  await textbox.fill(text);

  const postBtn = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
  await postBtn.click();

  // brief settle; if it fails, Playwright will throw earlier on click.
  await page.waitForTimeout(1_000);
}

function backoffMs(attempt: number): number {
  if (attempt <= 1) return 1_000;
  if (attempt === 2) return 3_000;
  return 7_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


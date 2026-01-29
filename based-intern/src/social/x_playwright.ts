import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import type { SocialPoster } from "./poster.js";

type XPostResult = {
  tweetId: string;
  tweetUrl: string;
};

class XAutomationBlockedError extends Error {
  readonly toastText?: string;
  constructor(message: string, toastText?: string) {
    super(message);
    this.name = "XAutomationBlockedError";
    this.toastText = toastText;
  }
}

export function createXPosterPlaywright(cfg: AppConfig): SocialPoster {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  async function ensurePage(): Promise<Page> {
    if (page) return page;

    browser = await launchBrowser(cfg.HEADLESS);

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

  async function postOnce(text: string): Promise<XPostResult> {
    const p = await ensurePage();
    await p.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

    // Prefer cookies-based auth for stability (headless-friendly).
    const loggedIn = (await hasAuthCookies(p)) || (await hasComposeUi(p));
    if (!loggedIn) {
      await loginIfPossible(p, cfg);
    }

    const result = await composeAndPost(p, text);

    // If we successfully posted and cookies are enabled, persist the refreshed session.
    // This helps reduce "works once then fails" when X rotates session cookies.
    if (cfg.X_COOKIES_PATH && context) {
      try {
        await ensureParentDir(cfg.X_COOKIES_PATH);
        await context.storageState({ path: cfg.X_COOKIES_PATH });
        logger.info("refreshed X cookies after post", { path: cfg.X_COOKIES_PATH });
      } catch (err) {
        logger.warn("failed to refresh X cookies after post", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return result;
  }

  return {
    async post(text: string) {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await postOnce(text);
          logger.info("posted to X (playwright)", { attempt, tweetUrl: result.tweetUrl, tweetId: result.tweetId });
          return;
        } catch (err) {
          if (err instanceof XAutomationBlockedError) {
            // Datacenter/automation block. Retrying immediately usually makes it worse.
            const debug = page ? await collectFailureDebug(page) : undefined;
            logger.error("X blocked automated posting (playwright). This is usually an anti-bot/IP reputation issue (common on Railway).", {
              attempt,
              error: err.message,
              toastText: err.toastText,
              debug,
              fix:
                "Run Playwright posting from a residential IP/your own machine, or switch to SOCIAL_MODE=x_api with paid API access. " +
                "On Railway specifically, consider SOCIAL_MODE=none for now."
            });
            return;
          }
          const debug = page ? await collectFailureDebug(page) : undefined;
          logger.warn("failed to post to X (playwright)", {
            attempt,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            debug
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

async function launchBrowser(headless: boolean): Promise<Browser> {
  const args = ["--disable-blink-features=AutomationControlled"];
  // Prefer installed browsers first (less likely to trigger auth blocks).
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ headless, channel, args });
    } catch {
      // ignore
    }
  }
  return await chromium.launch({ headless, args });
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

async function hasComposeUi(page: Page): Promise<boolean> {
  const compose = page.locator('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetTextarea_0"]');
  return (await compose.count()) > 0;
}

async function hasAuthCookies(page: Page): Promise<boolean> {
  try {
    const cookies = await page.context().cookies();
    const names = new Set(cookies.map((c) => c.name));
    return names.has("auth_token") || names.has("ct0");
  } catch {
    return false;
  }
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

async function composeAndPost(page: Page, text: string): Promise<XPostResult> {
  // Open composer
  const newTweet = page.locator('[data-testid="SideNav_NewTweet_Button"]');
  if ((await newTweet.count()) > 0) {
    await newTweet.first().click();
  }

  const textbox = page.locator('[data-testid="tweetTextarea_0"], div[role="textbox"]').first();
  await textbox.click();
  await textbox.fill(text);

  const postBtn = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
  const createTweetResponse = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("/i/api/graphql/") && res.url().includes("CreateTweet"),
    { timeout: 30_000 }
  );

  await postBtn.click();

  const res = await createTweetResponse;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const tweetId = extractTweetId(json);
  if (!tweetId) {
    const toastText = await readToastText(page);
    if (toastText && isAutomationBlockToast(toastText)) {
      throw new XAutomationBlockedError("X rejected the post as automated activity", toastText);
    }
    throw new Error(`post click did not yield tweet id (status=${res.status()})${toastText ? ` toast=${toastText}` : ""}`);
  }

  // Best-effort confirmation. If X blocks the post, we usually see a toast/alert.
  // Don't hard-fail on missing toast; we'll rely on upstream errors/timeouts.
  try {
    const toast = page.locator('[data-testid="toast"], div[role="alert"]').first();
    await toast.waitFor({ timeout: 3_000 });
  } catch {
    // ignore
  }

  // This URL format works without knowing the handle.
  const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
  return { tweetId, tweetUrl };
}

function backoffMs(attempt: number): number {
  if (attempt <= 1) return 1_000;
  if (attempt === 2) return 3_000;
  return 7_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureParentDir(filePath: string): Promise<void> {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const dir = path.dirname(abs);
  await mkdir(dir, { recursive: true });
}

async function collectFailureDebug(page: Page): Promise<Record<string, unknown>> {
  try {
    const url = page.url();
    const title = await page.title().catch(() => undefined);
    const authCookies = await hasAuthCookies(page);
    const composeUi = await hasComposeUi(page);

    // Try to capture any visible toast/alert text (often includes useful "something went wrong" copy).
    const toastText = await readToastText(page);

    // Small, useful snapshot: save a screenshot to disk (helpful locally; on Railway you’ll at least see the path).
    let screenshotPath: string | undefined;
    try {
      const outDir = path.resolve(process.cwd(), "data", "x_debug");
      await mkdir(outDir, { recursive: true });
      screenshotPath = path.join(outDir, `x_fail_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // ignore
    }

    // If we’re on a blocker page, capture a tiny snippet of content text for logs.
    let snippet: string | undefined;
    try {
      const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
      if (bodyText) snippet = bodyText.slice(0, 800);
    } catch {
      // ignore
    }

    return { url, title, authCookies, composeUi, toastText, screenshotPath, snippet };
  } catch (e) {
    return { debugError: e instanceof Error ? e.message : String(e) };
  }
}

function extractTweetId(payload: unknown): string | undefined {
  // Known X GraphQL structure (best-effort; may change).
  const p = payload as any;
  const candidate =
    p?.data?.create_tweet?.tweet_results?.result?.rest_id ??
    p?.data?.create_tweet?.tweet_results?.result?.tweet?.rest_id ??
    p?.data?.create_tweet?.tweet_results?.result?.legacy?.id_str ??
    p?.data?.create_tweet?.tweet_results?.result?.tweet?.legacy?.id_str;

  if (typeof candidate === "string" && /^\d{5,}$/.test(candidate)) return candidate;

  // Fallback: walk a small subset looking for a plausible rest_id/id_str.
  const found = findFirstIdLike(p);
  if (typeof found === "string" && /^\d{5,}$/.test(found)) return found;
  return undefined;
}

function findFirstIdLike(v: any, depth = 0): string | undefined {
  if (!v || depth > 6) return undefined;
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = findFirstIdLike(item, depth + 1);
      if (r) return r;
    }
    return undefined;
  }
  if (typeof v === "object") {
    // Prefer tweet-ish subtrees if present.
    if (v.tweet_results) {
      const r = findFirstIdLike(v.tweet_results, depth + 1);
      if (r) return r;
    }
    if (typeof v.rest_id === "string") return v.rest_id;
    if (typeof v.id_str === "string") return v.id_str;
    for (const key of Object.keys(v)) {
      const r = findFirstIdLike(v[key], depth + 1);
      if (r) return r;
    }
  }
  return undefined;
}

async function readToastText(page: Page): Promise<string | undefined> {
  try {
    const toast = page.locator('[data-testid="toast"], div[role="alert"]').first();
    if ((await toast.count()) > 0) {
      const t = (await toast.innerText().catch(() => "")).trim();
      return t.length ? t.slice(0, 500) : undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function isAutomationBlockToast(toastText: string): boolean {
  const t = toastText.toLowerCase();
  // Current wording seen in logs:
  // "This request looks like it might be automated. To protect our users from spam..."
  return t.includes("looks like it might be automated") || t.includes("protect our users from spam");
}


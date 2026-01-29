import * as dotenv from "dotenv";
import { chromium } from "playwright";
import path from "node:path";

// Load env from project dir (based-intern/.env) if present.
dotenv.config();

const DEFAULT_COOKIES_PATH = "./x_cookies.json";
const cookiesPath = process.env.X_COOKIES_PATH || DEFAULT_COOKIES_PATH;

async function main() {
  // Always use a visible browser so you can complete login/captcha/2FA.
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Start from home; X will redirect to login if needed.
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

  console.log("");
  console.log("Log into X in the opened browser window.");
  console.log("This script will auto-detect login, then save cookies.");
  console.log("");

  await waitForLogin(context, page);

  const outPath = path.resolve(process.cwd(), cookiesPath);
  await context.storageState({ path: outPath });

  console.log(`Saved Playwright storageState to: ${outPath}`);
  console.log("You can now run the agent with:");
  console.log(`  SOCIAL_MODE=playwright X_COOKIES_PATH=\"${cookiesPath}\" HEADLESS=true npm run dev`);

  await browser.close();
}

async function launchBrowser() {
  const args = ["--disable-blink-features=AutomationControlled"];
  // Prefer installed browsers (less likely to trigger login blocks).
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ headless: false, channel, args });
    } catch {
      // ignore and fall back
    }
  }
  return await chromium.launch({ headless: false, args });
}

async function waitForLogin(context: any, page: any): Promise<void> {
  const timeoutMs = 10 * 60_000; // 10 minutes
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Strong signal: auth cookies exist (works even if X lands on a non-home page).
    try {
      const cookies = await context.cookies();
      const names = new Set(cookies.map((c: any) => c?.name));
      if (names.has("auth_token") || names.has("ct0")) return;
    } catch {
      // ignore
    }

    // Fallback heuristic: compose UI exists.
    try {
      const compose = page.locator('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetTextarea_0"]');
      if ((await compose.count()) > 0) return;
    } catch {
      // ignore
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error("Timed out waiting for X login. Try again (captcha/2FA may require more time).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


import * as dotenv from "dotenv";
import { chromium } from "playwright";
import path from "node:path";
import { createInterface } from "node:readline";

// Load env from project dir (based-intern/.env) if present.
dotenv.config();

const DEFAULT_COOKIES_PATH = "./x_cookies.json";
const cookiesPath = process.env.X_COOKIES_PATH || DEFAULT_COOKIES_PATH;

async function main() {
  // Always use a visible browser so you can complete login/captcha/2FA.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Go to login flow; you can also just navigate to https://x.com and login.
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" });

  console.log("");
  console.log("Log into X in the opened browser window.");
  console.log("When you are fully logged in, return here and press ENTER.");
  console.log("");

  await waitForEnter();

  const outPath = path.resolve(process.cwd(), cookiesPath);
  await context.storageState({ path: outPath });

  console.log(`Saved Playwright storageState to: ${outPath}`);
  console.log("You can now run the agent with:");
  console.log(`  SOCIAL_MODE=playwright X_COOKIES_PATH=\"${cookiesPath}\" HEADLESS=true npm run dev`);

  await browser.close();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


/**
 * Neynar notification utilities for Base mini app.
 * Send push notifications to users who saved the mini app.
 *
 * Requires NEYNAR_API_KEY env var.
 */

const NEYNAR_API_URL = "https://api.neynar.com/v2";

export type NotificationPayload = {
  title: string;
  body: string;
  targetUrl: string;
  tokens: string[]; // Notification tokens from webhook events
};

/**
 * Send a notification to users via Neynar.
 * Called from the agent when significant events occur.
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<boolean> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.warn("NEYNAR_API_KEY not set — skipping notification");
    return false;
  }

  if (payload.tokens.length === 0) return false;

  try {
    const res = await fetch(`${NEYNAR_API_URL}/farcaster/frame/notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        target_url: payload.targetUrl,
        tokens: payload.tokens,
      }),
    });

    if (!res.ok) {
      console.error("Notification send failed:", res.status, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("Notification error:", err);
    return false;
  }
}

/**
 * Notification templates for common agent events.
 */
export const notificationTemplates = {
  tradeExecuted: (action: "BUY" | "SELL", amount: string) => ({
    title: `Based Intern ${action === "BUY" ? "bought" : "sold"} $INTERN`,
    body:
      action === "BUY"
        ? `Just scooped more $INTERN (${amount}). The intern is accumulating.`
        : `Took some $INTERN profits (${amount}). Strategic moves.`,
    targetUrl: process.env.NEXT_PUBLIC_URL ?? "https://localhost:3000",
  }),

  lpMilestone: (tvlEth: string) => ({
    title: "Pool TVL Milestone!",
    body: `INTERN/WETH pool just hit ${tvlEth} ETH TVL on Aerodrome. The community is growing.`,
    targetUrl: `${process.env.NEXT_PUBLIC_URL ?? "https://localhost:3000"}/pool`,
  }),

  newContent: (preview: string) => ({
    title: "Hot take from the intern",
    body: preview.slice(0, 100),
    targetUrl: `${process.env.NEXT_PUBLIC_URL ?? "https://localhost:3000"}/feed`,
  }),
};

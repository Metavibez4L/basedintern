const ROOT_URL = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

export const minikitConfig = {
  accountAssociation: {
    header: "eyJmaWQiOjI3MDg5NTUsInR5cGUiOiJhdXRoIiwia2V5IjoiMHg3MjhBM2Y3NTU4MDk3ODJCQzI0OGJCMDg1ZUYxNzgyM0UwRjE2NzREIn0",
    payload: "eyJkb21haW4iOiJiYXNlZGludGVybi52ZXJjZWwuYXBwIn0",
    signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABvT_rf6WzrB0SVHDNRyK6aL8Mn-nY_eHpf0kxY396WlEbXQ0iwQK5Sq1C0unw57E_FCjudWmxtoZMrqJvq-wDkQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAl8ZgIay2xclZzG8RWZzuWvO8j9R0fus3XxDee9lRlVy8dAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACKeyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiTFI2ckZwNVAzU01uWXl5cmFQcThRa1gta3c0UGFkdlFsOVgwbHQ4Z3RDayIsIm9yaWdpbiI6Imh0dHBzOi8va2V5cy5jb2luYmFzZS5jb20iLCJjcm9zc09yaWdpbiI6ZmFsc2V9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  },
  miniapp: {
    version: "1" as const,
    name: "Based Intern",
    subtitle: "Agent-Powered Token Community",
    description:
      "The Based Intern is an autonomous AI agent that trades $INTERN, provides liquidity on Aerodrome, and posts viral content. Watch the intern work, swap tokens, and join the community.",
    screenshotUrls: [] as string[],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#050a14",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "finance" as const,
    tags: ["trading", "agent", "liquidity", "defi", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Watch the intern work.",
    ogTitle: "Based Intern — Agent-Powered Token Community",
    ogDescription:
      "An AI agent that trades, provides liquidity, and posts content for the $INTERN community on Base.",
    ogImageUrl: `${ROOT_URL}/og.png`,
    noindex: false,
  },
} as const;

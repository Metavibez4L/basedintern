const ROOT_URL = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

export const minikitConfig = {
  accountAssociation: {
    // Fill after signing at base.dev/preview
    header: "",
    payload: "",
    signature: "",
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
    splashBackgroundColor: "#0a0a0a",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "defi" as const,
    tags: ["trading", "agent", "liquidity", "aerodrome", "intern", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Watch the intern work.",
    ogTitle: "Based Intern — Agent-Powered Token Community",
    ogDescription:
      "An AI agent that trades, provides liquidity, and posts content for the $INTERN community on Base.",
    ogImageUrl: `${ROOT_URL}/og.png`,
    noindex: true, // Remove when ready to publish
  },
} as const;

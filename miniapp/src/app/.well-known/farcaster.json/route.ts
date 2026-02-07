import { NextResponse } from "next/server";
import { minikitConfig } from "@/minikit.config";

export async function GET() {
  const { accountAssociation, miniapp } = minikitConfig;
    return NextResponse.json({
    accountAssociation,
    frame: {
      version: miniapp.version,
      name: miniapp.name,
      subtitle: miniapp.subtitle,
      description: miniapp.description,
      screenshotUrls: miniapp.screenshotUrls,
      iconUrl: miniapp.iconUrl,
      imageUrl: miniapp.iconUrl,
      splashImageUrl: miniapp.splashImageUrl,
      splashBackgroundColor: miniapp.splashBackgroundColor,
      homeUrl: miniapp.homeUrl,
      webhookUrl: miniapp.webhookUrl,
      primaryCategory: miniapp.primaryCategory,
      tags: miniapp.tags,
      heroImageUrl: miniapp.heroImageUrl,
      tagline: miniapp.tagline,
      ogTitle: miniapp.ogTitle,
      ogDescription: miniapp.ogDescription,
      ogImageUrl: miniapp.ogImageUrl,
      noindex: miniapp.noindex,
    },
  });
}

import type { Metadata } from "next";
import { Providers } from "./providers";
import { BottomNav } from "@/components/BottomNav";
import { minikitConfig } from "@/minikit.config";
import "./globals.css";

const { miniapp } = minikitConfig;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: miniapp.name,
    description: miniapp.description,
    icons: {
      icon: "/mascot.png",
    },
    other: {
      "base:app_id": "698766dd6dea3c7b8e149ea9",
      "fc:miniapp": JSON.stringify({
        version: miniapp.version,
        imageUrl: miniapp.heroImageUrl,
        button: {
          title: `Join the ${miniapp.name}`,
          action: {
            name: `Launch ${miniapp.name}`,
            url: miniapp.homeUrl,
          },
        },
      }),
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cyber-dark text-cyber-text antialiased scanline">
        <Providers>
          <main className="pb-20 min-h-screen">{children}</main>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}

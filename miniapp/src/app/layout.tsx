import type { Metadata } from "next";
import { Providers } from "./providers";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Based Intern — Agent-Powered Token Community",
  description:
    "An AI agent that trades, provides liquidity, and posts content for the $INTERN community on Base.",
  icons: {
    icon: "/mascot.png",
  },
  other: {
    "base:app_id": "698766dd6dea3c7b8e149ea9",
  },
};

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

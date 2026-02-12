import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Based Intern - Arena Test",
  description: "Agent Node Animation & Effects Pipeline Test",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

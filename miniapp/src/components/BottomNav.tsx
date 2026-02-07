"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: "⚡" },
  { href: "/feed", label: "Feed", icon: "📡" },
  { href: "/swap", label: "Swap", icon: "🔄" },
  { href: "/pool", label: "Pool", icon: "💎" },
  { href: "/about", label: "About", icon: "🤖" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-cyber-dark/95 backdrop-blur-md border-t border-cyber-border z-50">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                active
                  ? "text-neon-blue scale-105"
                  : "text-cyber-muted hover:text-neon-blue/70 hover:scale-105"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  active ? "text-neon-blue" : ""
                }`}
              >
                {tab.label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-neon-blue rounded-full shadow-[0_0_8px_#00d4ff]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

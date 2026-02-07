"use client";

import { useEffect, useState } from "react";
import { ActionCard } from "@/components/ActionCard";
import type { ActionLogEntry } from "@/lib/api";
import { AGENT_API_URL } from "@/lib/constants";

type FilterType = "all" | "trade" | "lp" | "social" | "news";

const filters: { key: FilterType; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "⚡" },
  { key: "trade", label: "Trades", icon: "📊" },
  { key: "lp", label: "LP", icon: "💎" },
  { key: "social", label: "Social", icon: "🔗" },
  { key: "news", label: "News", icon: "📡" },
];

export default function FeedPage() {
  const [feed, setFeed] = useState<ActionLogEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${AGENT_API_URL}/api/feed`);
        if (res.ok) setFeed(await res.json());
      } catch {
        // Offline
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const filtered =
    filter === "all" ? feed : feed.filter((a) => a.type === filter);

  return (
    <div className="px-4 pt-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold tracking-tight mb-1 glitch-text">
        Agent Feed
        <span className="cursor-blink text-neon-blue">_</span>
      </h1>
      <p className="text-xs text-cyber-muted mb-4">
        Everything the intern does, in real time.
      </p>

      {/* Filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
              filter === f.key
                ? "bg-neon-blue text-cyber-dark shadow-[0_0_12px_#00d4ff40]"
                : "bg-cyber-card border border-cyber-border text-cyber-muted hover:text-neon-blue hover:border-neon-blue/30"
            }`}
          >
            <span className="text-sm">{f.icon}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-cyber-card border border-cyber-border rounded-xl p-4"
            >
              <div className="h-4 shimmer rounded w-1/4 mb-2" />
              <div className="h-3 shimmer rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((action, i) => (
            <ActionCard key={`${action.timestamp}-${i}`} action={action} />
          ))}
        </div>
      ) : (
        <div className="bg-cyber-card border border-cyber-border rounded-xl p-8 text-center border-glow">
          <p className="text-4xl mb-3">📡</p>
          <p className="text-sm text-cyber-muted">
            {filter === "all"
              ? "No activity yet. The intern is getting ready..."
              : `No ${filter} activity yet.`}
          </p>
          <div className="mt-3">
            <span className="text-neon-blue text-xs font-mono">
              {`>`} scanning for signals<span className="cursor-blink">_</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

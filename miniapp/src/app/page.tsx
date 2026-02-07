"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { ActionCard } from "@/components/ActionCard";
import type { AgentStats, PoolData, ActionLogEntry } from "@/lib/api";
import { AGENT_API_URL } from "@/lib/constants";

export default function HomePage() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [pool, setPool] = useState<PoolData | null>(null);
  const [feed, setFeed] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, p, f] = await Promise.all([
          fetch(`${AGENT_API_URL}/api/stats`).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`${AGENT_API_URL}/api/pool`).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`${AGENT_API_URL}/api/feed`).then((r) =>
            r.ok ? r.json() : []
          ),
        ]);
        setStats(s);
        setPool(p);
        setFeed(f);
      } catch {
        // Agent might be unreachable
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const status = stats?.status ?? "offline";
  const internPrice = pool?.internPrice ?? "—";
  const tvl = pool?.tvlWei
    ? `${(Number(pool.tvlWei) / 1e18).toFixed(4)} ETH`
    : "—";
  const latestAction = feed[0] ?? null;

  return (
    <div className="px-4 pt-6 space-y-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Based Intern
            <span className="cursor-blink text-intern-green">_</span>
          </h1>
          <p className="text-xs text-intern-muted mt-1">
            autonomous agent on Base
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Price Ticker */}
      <div className="bg-intern-card border border-intern-green/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-intern-muted uppercase tracking-wider">
              $INTERN Price
            </p>
            <p className="text-3xl font-bold text-intern-green mt-1">
              {loading ? "..." : internPrice}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-intern-muted uppercase tracking-wider">
              Pool TVL
            </p>
            <p className="text-lg font-bold text-white mt-1">
              {loading ? "..." : tvl}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Trades"
          value={loading ? "..." : String(stats?.tradesToday ?? 0)}
          sub="today"
        />
        <StatCard
          label="LP Share"
          value={
            loading
              ? "..."
              : stats?.lpSharePercent != null
                ? `${stats.lpSharePercent.toFixed(1)}%`
                : "—"
          }
        />
        <StatCard
          label="Posts"
          value={loading ? "..." : String(stats?.socialPostsToday ?? 0)}
          sub="today"
        />
      </div>

      {/* CTAs */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/swap"
          className="bg-intern-green text-black font-bold text-center py-3 rounded-xl hover:bg-intern-green-dim transition-colors text-sm uppercase tracking-wider"
        >
          Buy $INTERN
        </Link>
        <Link
          href="/pool"
          className="bg-intern-card border border-intern-green/30 text-intern-green font-bold text-center py-3 rounded-xl hover:bg-intern-green/10 transition-colors text-sm uppercase tracking-wider"
        >
          Add Liquidity
        </Link>
      </div>

      {/* Latest Action */}
      {latestAction && (
        <div>
          <h2 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
            Latest Agent Action
          </h2>
          <ActionCard action={latestAction} />
        </div>
      )}

      {/* Recent Feed Preview */}
      {feed.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-intern-muted uppercase tracking-wider">
              Recent Activity
            </h2>
            <Link
              href="/feed"
              className="text-xs text-intern-green hover:underline"
            >
              See all →
            </Link>
          </div>
          <div className="space-y-3">
            {feed.slice(1, 4).map((action, i) => (
              <ActionCard key={`${action.timestamp}-${i}`} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && feed.length === 0 && (
        <div className="bg-intern-card border border-intern-border rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">🤖</p>
          <p className="text-sm text-intern-muted">
            The intern is warming up...
          </p>
          <p className="text-xs text-intern-muted mt-1">
            Activity will appear here once the agent starts working.
          </p>
        </div>
      )}
    </div>
  );
}

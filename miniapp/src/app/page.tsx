"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  const [pulse, setPulse] = useState(false);

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
        // Trigger pulse animation on data refresh
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
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
  const uptime = stats?.uptime
    ? formatUptime(stats.uptime)
    : "—";
  const latestAction = feed[0] ?? null;

  return (
    <div className="px-4 pt-6 space-y-6 max-w-md mx-auto">
      {/* Hero: Mascot + Header */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Image
            src="/mascot.png"
            alt="Based Intern"
            width={72}
            height={72}
            className="rounded-2xl mascot-glow float"
            priority
          />
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-neon-blue live-pulse border-2 border-cyber-dark" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight glitch-text">
            Based Intern
            <span className="cursor-blink text-neon-blue">_</span>
          </h1>
          <p className="text-xs text-cyber-muted mt-1">
            autonomous agent on Base
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Price Ticker */}
      <div
        className={`bg-cyber-card border border-cyber-border rounded-2xl p-5 card-glow relative overflow-hidden transition-all duration-300 ${
          pulse ? "border-neon-blue/50 shadow-[0_0_30px_#00d4ff15]" : ""
        }`}
      >
        {/* Decorative corner lines */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-neon-blue/30 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-neon-blue/30 rounded-br-2xl" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-cyber-muted uppercase tracking-widest">
              $INTERN Price
            </p>
            <p className="text-3xl font-bold text-neon-blue mt-1 tracking-tight">
              {loading ? (
                <span className="shimmer inline-block w-32 h-9 rounded" />
              ) : (
                internPrice
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-cyber-muted uppercase tracking-widest">
              Pool TVL
            </p>
            <p className="text-lg font-bold text-white mt-1">
              {loading ? (
                <span className="shimmer inline-block w-20 h-6 rounded" />
              ) : (
                tvl
              )}
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
          label="Uptime"
          value={loading ? "..." : uptime}
          sub={stats?.dryRun ? "dry run" : "live"}
        />
      </div>

      {/* CTAs */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/swap"
          className="btn-neon bg-neon-blue text-cyber-dark font-bold text-center py-3.5 rounded-xl text-sm uppercase tracking-wider relative z-10"
        >
          Buy $INTERN
        </Link>
        <Link
          href="/pool"
          className="bg-cyber-card border border-neon-blue/30 text-neon-blue font-bold text-center py-3.5 rounded-xl hover:bg-neon-blue/10 hover:border-neon-blue/50 transition-all text-sm uppercase tracking-wider hover:shadow-[0_0_15px_#00d4ff20]"
        >
          Add Liquidity
        </Link>
      </div>

      {/* Latest Action */}
      {latestAction && (
        <div>
          <h2 className="text-xs text-cyber-muted uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neon-blue live-pulse" />
            Latest Agent Action
          </h2>
          <ActionCard action={latestAction} />
        </div>
      )}

      {/* Recent Feed Preview */}
      {feed.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-cyber-muted uppercase tracking-widest">
              Recent Activity
            </h2>
            <Link
              href="/feed"
              className="text-xs text-neon-blue hover:text-neon-blue-dim hover:underline transition-colors"
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
        <div className="bg-cyber-card border border-cyber-border rounded-2xl p-8 text-center card-glow border-glow">
          <Image
            src="/mascot.png"
            alt="Based Intern"
            width={80}
            height={80}
            className="mx-auto mb-4 mascot-glow float rounded-xl"
          />
          <p className="text-sm text-cyber-muted">
            The intern is warming up...
          </p>
          <p className="text-xs text-cyber-muted mt-1">
            Activity will appear here once the agent starts working.
          </p>
          <div className="mt-4 flex justify-center">
            <span className="text-neon-blue text-xs font-mono">
              {`>`} initializing neural pathways
              <span className="cursor-blink">_</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

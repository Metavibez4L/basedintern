"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import type { PoolData, AgentStats } from "@/lib/api";
import { AGENT_API_URL, AERODROME_DEPOSIT_URL, POOL_ADDRESS } from "@/lib/constants";

export default function PoolPage() {
  const [pool, setPool] = useState<PoolData | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, s] = await Promise.all([
          fetch(`${AGENT_API_URL}/api/pool`).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`${AGENT_API_URL}/api/stats`).then((r) =>
            r.ok ? r.json() : null
          ),
        ]);
        setPool(p);
        setStats(s);
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

  const tvlEth = pool?.tvlWei
    ? (Number(pool.tvlWei) / 1e18).toFixed(4)
    : "—";
  const reserve0 = pool?.reserve0
    ? (Number(pool.reserve0) / 1e18).toFixed(4)
    : "—";
  const reserve1 = pool?.reserve1
    ? (Number(pool.reserve1) / 1e18).toFixed(2)
    : "—";

  return (
    <div className="px-4 pt-6 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight mb-1">
          INTERN/WETH Pool
          <span className="cursor-blink text-intern-green">_</span>
        </h1>
        <p className="text-xs text-intern-muted">
          Volatile pool on Aerodrome, Base mainnet.
        </p>
      </div>

      {/* Pool Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="TVL" value={loading ? "..." : `${tvlEth} ETH`} />
        <StatCard
          label="INTERN Price"
          value={loading ? "..." : pool?.internPrice ?? "—"}
        />
        <StatCard
          label="WETH Reserve"
          value={loading ? "..." : `${reserve0}`}
        />
        <StatCard
          label="INTERN Reserve"
          value={loading ? "..." : `${reserve1}`}
        />
      </div>

      {/* Agent LP Position */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-4">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
          Agent&apos;s LP Position
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-intern-muted">Pool Share</span>
            <span className="text-white font-bold">
              {loading
                ? "..."
                : stats?.lpSharePercent != null
                  ? `${stats.lpSharePercent.toFixed(2)}%`
                  : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">Pool TVL</span>
            <span className="text-white">
              {loading ? "..." : `${tvlEth} ETH`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">Status</span>
            <span className="text-intern-green font-bold">Active</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <a
        href={AERODROME_DEPOSIT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-intern-green text-black font-bold text-center py-4 rounded-xl hover:bg-intern-green-dim transition-colors text-sm uppercase tracking-wider"
      >
        Add Liquidity on Aerodrome
      </a>

      {/* Pool Info */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-4">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
          Pool Details
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-intern-muted">Type</span>
            <span className="text-white">Volatile (x*y=k)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">Fee</span>
            <span className="text-white">0.3%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">DEX</span>
            <span className="text-intern-green">Aerodrome</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-intern-muted">Contract</span>
            <a
              href={`https://basescan.org/address/${POOL_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-intern-green text-xs hover:underline font-mono"
            >
              {POOL_ADDRESS.slice(0, 6)}...{POOL_ADDRESS.slice(-4)}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

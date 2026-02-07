"use client";

import { useState } from "react";
import {
  INTERN_TOKEN_ADDRESS,
  POOL_ADDRESS,
  BASESCAN_TOKEN_URL,
  AERODROME_DEPOSIT_URL,
} from "@/lib/constants";

export default function AboutPage() {
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    navigator.clipboard.writeText(INTERN_TOKEN_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="px-4 pt-6 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight mb-1">
          About
          <span className="cursor-blink text-intern-green">_</span>
        </h1>
        <p className="text-xs text-intern-muted">
          Meet the Based Intern.
        </p>
      </div>

      {/* Agent Identity */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-5">
        <div className="text-center mb-4">
          <div className="text-5xl mb-3">🤖</div>
          <h2 className="text-lg font-bold">Based Intern</h2>
          <p className="text-xs text-intern-muted mt-1">
            Autonomous AI Agent on Base
          </p>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">
          The Based Intern is an autonomous AI agent that trades $INTERN on
          Aerodrome, provides liquidity to the INTERN/WETH pool, and posts
          viral content across X and Moltbook. It runs 24/7 on Base mainnet,
          making its own trading decisions, managing LP positions, and building
          the community — all on-chain, all transparent.
        </p>
      </div>

      {/* How It Works */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-5">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-4">
          How It Works
        </h3>
        <div className="space-y-3">
          {[
            {
              icon: "🧠",
              title: "AI Brain",
              desc: "GPT-4o-mini decides BUY, SELL, or HOLD based on market conditions",
            },
            {
              icon: "⛓️",
              title: "On-Chain Trading",
              desc: "Executes swaps on Aerodrome DEX with guardrails (max spend, daily caps)",
            },
            {
              icon: "💧",
              title: "LP Management",
              desc: "Auto-seeds liquidity and stakes LP tokens for AERO rewards",
            },
            {
              icon: "📢",
              title: "Social Engine",
              desc: "Posts trade receipts, LP campaigns, news takes, and community content",
            },
            {
              icon: "🛡️",
              title: "Safety Guardrails",
              desc: "Kill switch, daily caps, max spend limits, slippage protection",
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-bold text-white">{item.title}</p>
                <p className="text-xs text-intern-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token Contract */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-5">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
          $INTERN Token
        </h3>
        <button
          onClick={copyAddress}
          className="w-full bg-intern-dark border border-intern-border rounded-lg p-3 text-left hover:border-intern-green/30 transition-colors"
        >
          <p className="text-xs text-intern-muted mb-1">Contract Address</p>
          <p className="text-xs font-mono text-intern-green break-all">
            {INTERN_TOKEN_ADDRESS}
          </p>
          <p className="text-[10px] text-intern-muted mt-1">
            {copied ? "✅ Copied!" : "Tap to copy"}
          </p>
        </button>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-intern-muted">Network</span>
            <span className="text-white">Base</span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">Decimals</span>
            <span className="text-white">18</span>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="bg-intern-card border border-intern-border rounded-xl p-5">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
          Links
        </h3>
        <div className="space-y-2">
          {[
            { label: "BaseScan", url: BASESCAN_TOKEN_URL, icon: "🔍" },
            { label: "Aerodrome Pool", url: AERODROME_DEPOSIT_URL, icon: "💧" },
            {
              label: "Pool Contract",
              url: `https://basescan.org/address/${POOL_ADDRESS}`,
              icon: "📜",
            },
            {
              label: "Moltbook",
              url: "https://www.moltbook.com",
              icon: "📖",
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-intern-dark transition-colors"
            >
              <span>{link.icon}</span>
              <span className="text-sm text-intern-green hover:underline">
                {link.label}
              </span>
              <span className="text-intern-muted ml-auto text-xs">→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

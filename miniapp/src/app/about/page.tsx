"use client";

import { useState } from "react";
import Image from "next/image";
import {
  INTERN_TOKEN_ADDRESS,
  POOL_ADDRESS,
  BASESCAN_TOKEN_URL,
  AERODROME_DEPOSIT_URL,
  AERODROME_POOL_URL,
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
        <h1 className="text-xl font-bold tracking-tight mb-1 glitch-text">
          About
          <span className="cursor-blink text-neon-blue">_</span>
        </h1>
        <p className="text-xs text-cyber-muted">
          Meet the Based Intern.
        </p>
      </div>

      {/* Agent Identity */}
      <div className="bg-cyber-card border border-cyber-border rounded-2xl p-6 card-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-neon-blue/30 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-neon-blue/30 rounded-br-2xl" />
        <div className="text-center mb-5">
          <Image
            src="/mascot.png"
            alt="Based Intern"
            width={100}
            height={100}
            className="mx-auto rounded-2xl mascot-glow float"
          />
          <h2 className="text-lg font-bold mt-4 text-gradient">Based Intern</h2>
          <p className="text-xs text-cyber-muted mt-1">
            Autonomous AI Agent on Base
          </p>
        </div>
        <p className="text-sm text-cyber-text leading-relaxed">
          The Based Intern is an autonomous AI agent that trades $INTERN on
          Aerodrome, provides liquidity to the INTERN/WETH pool, and posts
          viral content across X and Moltbook. It runs 24/7 on Base mainnet,
          making its own trading decisions, managing LP positions, and building
          the community — all on-chain, all transparent.
        </p>
      </div>

      {/* How It Works */}
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-4">
          How It Works
        </h3>
        <div className="space-y-4">
          {[
            {
              icon: "🧠",
              title: "AI Brain",
              desc: "GPT-4o-mini decides BUY, SELL, or HOLD based on market conditions",
              color: "border-l-neon-blue",
            },
            {
              icon: "⛓️",
              title: "On-Chain Trading",
              desc: "Executes swaps on Aerodrome DEX with guardrails (max spend, daily caps)",
              color: "border-l-neon-purple",
            },
            {
              icon: "💎",
              title: "LP Management",
              desc: "Auto-seeds liquidity and stakes LP tokens for AERO rewards",
              color: "border-l-cyan-400",
            },
            {
              icon: "🔗",
              title: "Social Engine",
              desc: "Posts trade receipts, LP campaigns, news takes, and community content",
              color: "border-l-blue-400",
            },
            {
              icon: "🛡️",
              title: "Safety Guardrails",
              desc: "Kill switch, daily caps, max spend limits, slippage protection",
              color: "border-l-indigo-400",
            },
          ].map((item) => (
            <div
              key={item.title}
              className={`flex items-start gap-3 pl-3 border-l-2 ${item.color} py-1 hover:bg-neon-blue/5 rounded-r-lg transition-colors`}
            >
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-bold text-white">{item.title}</p>
                <p className="text-xs text-cyber-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token Contract */}
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-3">
          $INTERN Token
        </h3>
        <button
          onClick={copyAddress}
          className={`w-full bg-cyber-dark border rounded-lg p-3 text-left transition-all duration-300 ${
            copied
              ? "border-neon-blue shadow-[0_0_15px_#00d4ff20]"
              : "border-cyber-border hover:border-neon-blue/30 hover:shadow-[0_0_10px_#00d4ff10]"
          }`}
        >
          <p className="text-xs text-cyber-muted mb-1">Contract Address</p>
          <p className="text-xs font-mono text-neon-blue break-all">
            {INTERN_TOKEN_ADDRESS}
          </p>
          <p className="text-[10px] text-cyber-muted mt-1">
            {copied ? (
              <span className="text-neon-blue">Copied to clipboard!</span>
            ) : (
              "Tap to copy"
            )}
          </p>
        </button>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-cyber-muted">Network</span>
            <span className="text-neon-blue">Base</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cyber-muted">Supply</span>
            <span className="text-white">1,000,000,000</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cyber-muted">Decimals</span>
            <span className="text-white">18</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cyber-muted">DEX</span>
            <span className="text-neon-blue">Aerodrome</span>
          </div>
        </div>
      </div>

      {/* Tokenomics */}
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-4">
          Tokenomics
        </h3>
        <p className="text-xs text-cyber-muted mb-4">
          1 billion $INTERN. Agent-powered distribution.
        </p>
        <div className="space-y-3">
          {[
            {
              label: "Agent Wallet",
              pct: "20%",
              tokens: "200M",
              desc: "Trading, LP, gas, operational treasury",
              color: "bg-neon-blue",
              width: "w-[20%]",
            },
            {
              label: "LP Pool (Aerodrome)",
              pct: "10-15%",
              tokens: "100-150M",
              desc: "Deep liquidity for community trading",
              color: "bg-cyan-400",
              width: "w-[12.5%]",
            },
            {
              label: "Community / Airdrop",
              pct: "30%",
              tokens: "300M",
              desc: "Early supporters, Moltbook users, mini app users",
              color: "bg-neon-purple",
              width: "w-[30%]",
            },
            {
              label: "Ecosystem / Partnerships",
              pct: "15%",
              tokens: "150M",
              desc: "Agent-to-agent collabs, integrations",
              color: "bg-blue-400",
              width: "w-[15%]",
            },
            {
              label: "Team / Treasury",
              pct: "20%",
              tokens: "200M",
              desc: "Development funding, operations",
              color: "bg-indigo-400",
              width: "w-[20%]",
            },
            {
              label: "Burn Reserve",
              pct: "5%",
              tokens: "50M",
              desc: "Deflationary events, milestones",
              color: "bg-red-400",
              width: "w-[5%]",
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-white">{item.label}</span>
                <span className="text-xs text-neon-blue font-mono">{item.pct}</span>
              </div>
              <div className="w-full bg-cyber-dark rounded-full h-2 mb-1">
                <div className={`${item.color} h-2 rounded-full ${item.width} opacity-80`} />
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-cyber-muted">{item.desc}</span>
                <span className="text-[10px] text-cyber-muted font-mono">{item.tokens}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Trading Strategy */}
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-4">
          Agent Trading Strategy
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-cyber-dark rounded-lg p-3 border border-green-500/20">
              <p className="text-lg font-bold text-green-400">40%</p>
              <p className="text-[10px] text-cyber-muted">BUY</p>
            </div>
            <div className="bg-cyber-dark rounded-lg p-3 border border-red-500/20">
              <p className="text-lg font-bold text-red-400">25%</p>
              <p className="text-[10px] text-cyber-muted">SELL</p>
            </div>
            <div className="bg-cyber-dark rounded-lg p-3 border border-cyber-border">
              <p className="text-lg font-bold text-cyber-muted">35%</p>
              <p className="text-[10px] text-cyber-muted">HOLD</p>
            </div>
          </div>
          <div className="space-y-1.5 text-xs text-cyber-muted">
            <div className="flex justify-between">
              <span>Daily trade cap</span>
              <span className="text-white">5 trades/day</span>
            </div>
            <div className="flex justify-between">
              <span>Max spend per trade</span>
              <span className="text-white">0.0005 ETH</span>
            </div>
            <div className="flex justify-between">
              <span>Sell fraction</span>
              <span className="text-white">2% per sell</span>
            </div>
            <div className="flex justify-between">
              <span>Slippage protection</span>
              <span className="text-white">5% max</span>
            </div>
          </div>
          <p className="text-[10px] text-cyber-muted italic">
            Net buyer bias. The agent acts as a market maker with gentle upward pressure.
          </p>
        </div>
      </div>

      {/* Links */}
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-3">
          Links
        </h3>
        <div className="space-y-1">
          {[
            { label: "Token on BaseScan", url: BASESCAN_TOKEN_URL, icon: "🔍" },
            { label: "Pool on BaseScan", url: AERODROME_POOL_URL, icon: "💎" },
            {
              label: "Aerodrome DEX",
              url: "https://aerodrome.finance",
              icon: "🏊",
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
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-neon-blue/5 transition-all group"
            >
              <span>{link.icon}</span>
              <span className="text-sm text-neon-blue group-hover:text-neon-blue-dim transition-colors">
                {link.label}
              </span>
              <span className="text-cyber-muted ml-auto text-xs group-hover:translate-x-1 transition-transform">
                →
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

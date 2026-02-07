"use client";

import { Swap, SwapAmountInput, SwapButton, SwapToggleButton, SwapMessage } from "@coinbase/onchainkit/swap";
import type { Token } from "@coinbase/onchainkit/token";
import { INTERN_TOKEN_ADDRESS, WETH_ADDRESS } from "@/lib/constants";

const internToken: Token = {
  name: "Based Intern",
  address: INTERN_TOKEN_ADDRESS,
  symbol: "INTERN",
  decimals: 18,
  image: "/mascot.png",
  chainId: 8453,
};

const wethToken: Token = {
  name: "Wrapped Ether",
  address: WETH_ADDRESS,
  symbol: "WETH",
  decimals: 18,
  image: "",
  chainId: 8453,
};

export default function SwapPage() {
  return (
    <div className="px-4 pt-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold tracking-tight mb-1 glitch-text">
        Swap
        <span className="cursor-blink text-neon-blue">_</span>
      </h1>
      <p className="text-xs text-cyber-muted mb-6">
        Buy or sell $INTERN directly on Base.
      </p>

      <div className="bg-cyber-card border border-cyber-border rounded-2xl p-4 card-glow relative overflow-hidden">
        {/* Decorative corner accents */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-neon-blue/30 rounded-tl-2xl" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-neon-blue/30 rounded-br-2xl" />
        <Swap>
          <SwapAmountInput label="From" token={wethToken} type="from" />
          <SwapToggleButton />
          <SwapAmountInput label="To" token={internToken} type="to" />
          <SwapButton />
          <SwapMessage />
        </Swap>
      </div>

      <div className="mt-6 bg-cyber-card border border-cyber-border rounded-xl p-4 card-glow">
        <h3 className="text-xs text-cyber-muted uppercase tracking-widest mb-3">
          Trade Info
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-cyber-muted">Pool</span>
            <span className="text-white">INTERN/WETH on Aerodrome</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cyber-muted">Network</span>
            <span className="text-neon-blue">Base</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cyber-muted">DEX</span>
            <span className="text-neon-blue">Aerodrome</span>
          </div>
        </div>
      </div>
    </div>
  );
}

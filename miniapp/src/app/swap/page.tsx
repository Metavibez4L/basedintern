"use client";

import { Swap, SwapAmountInput, SwapButton, SwapToggleButton, SwapMessage } from "@coinbase/onchainkit/swap";
import type { Token } from "@coinbase/onchainkit/token";
import { INTERN_TOKEN_ADDRESS, WETH_ADDRESS } from "@/lib/constants";

const internToken: Token = {
  name: "Based Intern",
  address: INTERN_TOKEN_ADDRESS,
  symbol: "INTERN",
  decimals: 18,
  image: "",
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
      <h1 className="text-xl font-bold tracking-tight mb-1">
        Swap
        <span className="cursor-blink text-intern-green">_</span>
      </h1>
      <p className="text-xs text-intern-muted mb-6">
        Buy or sell $INTERN directly on Base.
      </p>

      <div className="bg-intern-card border border-intern-border rounded-2xl p-4">
        <Swap>
          <SwapAmountInput label="From" token={wethToken} type="from" />
          <SwapToggleButton />
          <SwapAmountInput label="To" token={internToken} type="to" />
          <SwapButton />
          <SwapMessage />
        </Swap>
      </div>

      <div className="mt-6 bg-intern-card border border-intern-border rounded-xl p-4">
        <h3 className="text-xs text-intern-muted uppercase tracking-wider mb-3">
          Trade Info
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-intern-muted">Pool</span>
            <span className="text-white">INTERN/WETH on Aerodrome</span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">Network</span>
            <span className="text-white">Base</span>
          </div>
          <div className="flex justify-between">
            <span className="text-intern-muted">DEX</span>
            <span className="text-intern-green">Aerodrome</span>
          </div>
        </div>
      </div>
    </div>
  );
}

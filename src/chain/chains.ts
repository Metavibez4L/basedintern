import { base, baseSepolia, type Chain } from "viem/chains";

export type SupportedChainKey = "base-sepolia" | "base";

export function viemChain(chain: SupportedChainKey): Chain {
  return chain === "base-sepolia" ? baseSepolia : base;
}


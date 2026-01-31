import type { Address } from "viem";
import type { AppConfig } from "../../config.js";
import type { ChainClients } from "../client.js";

export type PriceResult = {
  text: string | null; // null => unknown
  source: string;
};

export type SwapCalldata = {
  to: Address;
  calldata: `0x${string}`;
  value?: bigint;
  deadline?: bigint;
};

export type DexProvider = {
  name: string;
  // Return a PriceResult or null if provider cannot quote
  getPrice: (cfg: AppConfig, clients: ChainClients, token: Address, weth: Address) => Promise<PriceResult | null>;
  // Optional: build calldata for a buy (spend ETH -> token) or sell (token -> ETH)
  buildBuyCalldata?: (
    cfg: AppConfig,
    clients: ChainClients,
    token: Address,
    weth: Address,
    wallet: Address,
    spendEth: bigint
  ) => Promise<SwapCalldata | null>;
  buildSellCalldata?: (
    cfg: AppConfig,
    clients: ChainClients,
    token: Address,
    weth: Address,
    wallet: Address,
    sellAmount: bigint
  ) => Promise<SwapCalldata | null>;
};

const providers: DexProvider[] = [];

export function registerDexProvider(p: DexProvider): void {
  providers.push(p);
}

export function getDexProviders(): DexProvider[] {
  return providers.slice();
}

export default { registerDexProvider, getDexProviders };

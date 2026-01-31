import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "../chain/client.js";

export type PriceResult = {
  text: string | null; // null => unknown
  source: string;
};

export type DexProvider = {
  name: string;
  // Return a PriceResult or null if provider cannot quote
  getPrice: (cfg: AppConfig, clients: ChainClients, token: Address, weth: Address) => Promise<PriceResult | null>;
};

const providers: DexProvider[] = [];

export function registerDexProvider(p: DexProvider): void {
  providers.push(p);
}

export function getDexProviders(): DexProvider[] {
  return providers.slice();
}

export default { registerDexProvider, getDexProviders };

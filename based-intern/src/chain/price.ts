import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";

export type PriceResult = {
  text: string | null; // null => unknown
  source: string;
};

/**
 * Best-effort price lookup.
 *
 * This scaffold returns unknown unless you wire up a pool/oracle.
 * The agent is still fully functional for posting receipts.
 */
export async function readBestEffortPrice(_cfg: AppConfig, _clients: ChainClients, _token: Address): Promise<PriceResult> {
  return { text: null, source: "unknown" };
}


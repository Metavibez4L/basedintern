import { canonicalizeUrl, fingerprintNewsItem } from "../fingerprint.js";
import type { NewsItem } from "../types.js";

type LlamaChainRow = {
  name?: string;
  tvl?: number;
};

type LlamaProtocol = {
  name?: string;
  url?: string;
  chainTvls?: Record<string, number>;
};

function fmtUsd(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "unknown";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BasedIntern/0.1 (+https://github.com/Metavibez4L/basedintern)"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDefiLlamaBaseSnapshot(): Promise<NewsItem[]> {
  // Best-effort: fetch Base TVL and top Base protocols by chain TVL.
  // Metrics like DEX volume/fees/active addresses are not consistently available across all llama endpoints,
  // so we keep this conservative and purely informational.
  const chains = await fetchJson<LlamaChainRow[]>("https://api.llama.fi/v2/chains");
  const base = chains.find((c) => (c.name ?? "").toLowerCase() === "base");

  const protocols = await fetchJson<LlamaProtocol[]>("https://api.llama.fi/protocols");
  const top = protocols
    .map((p) => ({
      name: (p.name ?? "").trim() || "Unknown",
      url: (p.url ?? "").trim(),
      baseTvl: p.chainTvls?.["Base"] ?? 0
    }))
    .filter((p) => p.baseTvl > 0)
    .sort((a, b) => b.baseTvl - a.baseTvl)
    .slice(0, 3);

  const url = canonicalizeUrl("https://defillama.com/chain/Base");
  const title = "Base ecosystem snapshot (DeFiLlama)";
  const id = fingerprintNewsItem({ source: "defillama", title, url });

  const facts: string[] = [];
  facts.push(`Base TVL: ${fmtUsd(base?.tvl ?? null)}`);
  if (top.length) {
    facts.push(`Top protocols: ${top.map((p) => p.name).join(", ")}`);
  }

  const item: NewsItem = {
    id,
    fingerprint: id,
    source: "defillama",
    title,
    url,
    // Snapshot is "now" (not a dated feed item)
    publishedAtMs: Date.now(),
    facts,
    tags: ["base", "tvl", "protocols"],
    excerpt: undefined,
    summary: undefined
  };

  return [item];
}

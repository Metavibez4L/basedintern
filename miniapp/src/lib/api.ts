import { AGENT_API_URL, MOLTBOOK_BASE_URL } from "./constants";

// ===== Agent Control API =====

export type AgentStats = {
  status: "live" | "offline";
  lastTradeAt: number | null;
  tradesToday: number;
  lpTvlWei: string | null;
  lpSharePercent: number | null;
  socialPostsToday: number;
  uptime: number;
  dryRun: boolean;
};

export type PoolData = {
  tvlWei: string;
  reserve0: string;
  reserve1: string;
  internPrice: string;
  poolAddress: string;
};

export type ActionLogEntry = {
  type: "trade" | "lp" | "social" | "news";
  timestamp: number;
  summary: string;
  txHash?: string;
  platform?: string;
};

export type TokenData = {
  price: string;
  totalSupply: string;
  symbol: string;
  decimals: number;
};

async function fetchAgent<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${AGENT_API_URL}${path}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const agentApi = {
  stats: () => fetchAgent<AgentStats>("/api/stats"),
  pool: () => fetchAgent<PoolData>("/api/pool"),
  feed: () => fetchAgent<ActionLogEntry[]>("/api/feed"),
  token: () => fetchAgent<TokenData>("/api/token"),
};

// ===== Moltbook API =====

export type MoltbookPost = {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  author: {
    name: string;
    avatarUrl?: string;
  };
};

export async function fetchMoltbookFeed(): Promise<MoltbookPost[]> {
  try {
    const res = await fetch(`${MOLTBOOK_BASE_URL}/timeline?sort=new&limit=20`, {
      headers: {
        Authorization: `Bearer ${process.env.MOLTBOOK_API_KEY ?? ""}`,
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts ?? data ?? [];
  } catch {
    return [];
  }
}

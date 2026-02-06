/** Active news source IDs (used by the opinion pipeline in fetcher.ts) */
export type NewsSourceId =
  | "x_timeline"
  | "cryptopanic";

export type NewsItem = {
  // Stable identifier / dedupe key.
  // For all sources, this should be a sha256-based fingerprint.
  id: string;
  /** Source identifier — can be NewsSourceId or a legacy string for backward compat */
  source: string;
  title: string;
  url: string;
  publishedAtMs?: number;
  // Optional extra context
  excerpt?: string;
  summary?: string;
  facts?: string[];
  tags?: string[];
  score?: number;
  // Required by the News Brain spec; typically equals `id`.
  fingerprint: string;
};

export type ParsedNewsResult = {
  source: string;
  items: NewsItem[];
  errors: string[];
};

export type NewsPlan = {
  shouldPost: boolean;
  item?: NewsItem;
  reasons: string[];
};

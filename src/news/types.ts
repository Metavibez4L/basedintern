export type NewsSourceId =
  | "base_blog"
  | "base_dev_blog"
  | "cdp_launches"
  | "defillama"
  | "github"
  | "rss";

export type NewsItem = {
  // Stable identifier / dedupe key.
  // For all sources, this should be a sha256-based fingerprint.
  id: string;
  source: NewsSourceId;
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
  source: NewsSourceId;
  items: NewsItem[];
  errors: string[];
};

export type NewsPlan = {
  shouldPost: boolean;
  item?: NewsItem;
  reasons: string[];
};

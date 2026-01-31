export type NewsSourceId = "base_blog" | "base_dev_blog" | "cdp_launches";

export type NewsItem = {
  id: string;
  source: NewsSourceId;
  title: string;
  url: string;
  publishedAtMs?: number;
  excerpt?: string;
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

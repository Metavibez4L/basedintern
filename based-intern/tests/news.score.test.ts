import { describe, it, expect } from "vitest";
import { rankNewsItems, scoreNewsItem } from "../src/news/score.js";
import type { NewsItem } from "../src/news/types.js";

function mk(partial: Partial<NewsItem>): NewsItem {
  const base: NewsItem = {
    id: "fp",
    fingerprint: "fp",
    source: "x_timeline",
    title: "Base update",
    url: "https://example.com/a",
    publishedAtMs: Date.UTC(2026, 0, 1, 0, 0, 0),
    facts: [],
    tags: []
  };
  return { ...base, ...partial };
}

describe("news scoring", () => {
  it("prefers newer items", () => {
    const now = Date.UTC(2026, 0, 3, 0, 0, 0);
    const newer = mk({ publishedAtMs: now - 1 * 60 * 60 * 1000, fingerprint: "a", id: "a" });
    const older = mk({ publishedAtMs: now - 72 * 60 * 60 * 1000, fingerprint: "b", id: "b" });
    expect(scoreNewsItem(now, newer)).toBeGreaterThan(scoreNewsItem(now, older));
  });

  it("boosts important keywords", () => {
    const now = Date.UTC(2026, 0, 3, 0, 0, 0);
    const neutral = mk({ title: "Weekly recap", fingerprint: "n", id: "n" });
    const release = mk({ title: "Base node release v1.2.3", fingerprint: "r", id: "r" });
    expect(scoreNewsItem(now, release)).toBeGreaterThan(scoreNewsItem(now, neutral));
  });

  it("rankNewsItems is deterministic", () => {
    const now = Date.UTC(2026, 0, 3, 0, 0, 0);
    const a = mk({ publishedAtMs: now - 10_000, fingerprint: "aaa", id: "aaa" });
    const b = mk({ publishedAtMs: now - 10_000, fingerprint: "bbb", id: "bbb" });
    const ranked = rankNewsItems(now, [b, a]);
    expect(ranked[0].fingerprint).toBe("aaa");
    expect(ranked[1].fingerprint).toBe("bbb");
  });
});

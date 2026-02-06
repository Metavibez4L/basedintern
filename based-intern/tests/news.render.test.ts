import { describe, it, expect } from "vitest";
import { renderDeterministicNewsPost, truncateTo240, shouldIncludeNfaDisclaimer } from "../src/news/render.js";
import type { NewsItem } from "../src/news/types.js";

describe("news renderer", () => {
  it("truncateTo240 enforces 240 chars", () => {
    const out = truncateTo240("x".repeat(300));
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.endsWith("…")).toBe(true);
  });

  it("disclaimer rotation is deterministic", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const fp = "abc123";
    expect(shouldIncludeNfaDisclaimer(now, fp)).toBe(shouldIncludeNfaDisclaimer(now, fp));
  });

  it("rendered deterministic post includes URL and fits", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const item: NewsItem = {
      id: "fp1",
      fingerprint: "fp1",
      source: "x_timeline",
      title: "Base ecosystem update",
      url: "https://example.com/x",
      publishedAtMs: now,
      facts: ["Fact one", "Fact two", "Fact three"],
      tags: ["base"]
    };

    const text = renderDeterministicNewsPost(now, item);
    expect(text.length).toBeLessThanOrEqual(240);
    expect(text).toContain(item.url);
  });
});

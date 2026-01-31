import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGitHubAtomFeed, fetchRssAtomFeed } from "../src/news/providers/rssAtom.js";
import { fetchDefiLlamaBaseSnapshot } from "../src/news/providers/defillama.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetchRouter(routes: Array<{ match: RegExp; status?: number; body: string; contentType?: string }>) {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    const r = routes.find((x) => x.match.test(u));
    if (!r) throw new Error(`unexpected url: ${u}`);

    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) <= 299,
      status: r.status ?? 200,
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
      headers: new Headers({ "content-type": r.contentType ?? "text/plain" })
    } as any;
  }) as any;
}

describe("news providers", () => {
  it("parses GitHub Atom feed", async () => {
    mockFetchRouter([
      {
        match: /releases\.atom$/,
        body: `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Release v1.2.3</title>
    <link href="https://github.com/base/node/releases/tag/v1.2.3" />
    <updated>2026-01-01T00:00:00Z</updated>
  </entry>
</feed>`
      }
    ]);

    const items = await fetchGitHubAtomFeed("https://example.com/releases.atom");
    expect(items.length).toBe(1);
    expect(items[0].source).toBe("github");
    expect(items[0].title).toContain("Release");
  });

  it("parses RSS feed", async () => {
    mockFetchRouter([
      {
        match: /feed\.xml$/,
        body: `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Base thing happened</title>
      <link>https://example.com/a</link>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`
      }
    ]);

    const items = await fetchRssAtomFeed("https://example.com/feed.xml");
    expect(items.length).toBe(1);
    expect(items[0].source).toBe("rss");
    expect(items[0].url).toBe("https://example.com/a");
  });

  it("synthesizes DeFiLlama Base snapshot", async () => {
    mockFetchRouter([
      {
        match: /api\.llama\.fi\/v2\/chains/,
        body: JSON.stringify([{ name: "Base", tvl: 123_456_789 }]),
        contentType: "application/json"
      },
      {
        match: /api\.llama\.fi\/protocols/,
        body: JSON.stringify([
          { name: "ProtoA", url: "https://a", chainTvls: { Base: 111 } },
          { name: "ProtoB", url: "https://b", chainTvls: { Base: 222 } }
        ]),
        contentType: "application/json"
      }
    ]);

    const items = await fetchDefiLlamaBaseSnapshot();
    expect(items.length).toBe(1);
    expect(items[0].source).toBe("defillama");
    expect(items[0].facts?.join(" ")).toContain("Base TVL");
  });
});

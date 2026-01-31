import { logger } from "../../logger.js";
import { canonicalizeUrl, fingerprintNewsItem } from "../fingerprint.js";
import type { NewsItem } from "../types.js";

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m?.[1]?.trim() ?? null;
}

function decodeBasicXmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string): Array<{ title: string; url: string; publishedAtMs?: number }> {
  const out: Array<{ title: string; url: string; publishedAtMs?: number }> = [];
  const items = xml.split(/<item\b/i).slice(1);

  for (const chunk of items) {
    const itemXml = "<item" + chunk;

    const titleRaw =
      firstMatch(itemXml, /<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ??
      firstMatch(itemXml, /<title[^>]*>([\s\S]*?)<\/title>/i);

    const linkRaw =
      firstMatch(itemXml, /<link[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) ??
      firstMatch(itemXml, /<link[^>]*>([\s\S]*?)<\/link>/i);

    const pubRaw =
      firstMatch(itemXml, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ??
      firstMatch(itemXml, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);

    if (!titleRaw || !linkRaw) continue;

    const title = decodeBasicXmlEntities(titleRaw);
    const url = decodeBasicXmlEntities(linkRaw);

    let publishedAtMs: number | undefined;
    if (pubRaw) {
      const ms = Date.parse(pubRaw);
      if (Number.isFinite(ms)) publishedAtMs = ms;
    }

    out.push({ title, url, publishedAtMs });
  }

  return out;
}

function parseAtom(xml: string): Array<{ title: string; url: string; publishedAtMs?: number }> {
  const out: Array<{ title: string; url: string; publishedAtMs?: number }> = [];
  const entries = xml.split(/<entry\b/i).slice(1);

  for (const chunk of entries) {
    const entryXml = "<entry" + chunk;

    const titleRaw = firstMatch(entryXml, /<title[^>]*>([\s\S]*?)<\/title>/i);

    const href =
      firstMatch(entryXml, /<link[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/i) ??
      firstMatch(entryXml, /<link[^>]*href='([^']+)'[^>]*\/?>(?:<\/link>)?/i);

    const updatedRaw =
      firstMatch(entryXml, /<updated[^>]*>([\s\S]*?)<\/updated>/i) ??
      firstMatch(entryXml, /<published[^>]*>([\s\S]*?)<\/published>/i);

    if (!titleRaw || !href) continue;

    const title = decodeBasicXmlEntities(titleRaw);
    const url = decodeBasicXmlEntities(href);

    let publishedAtMs: number | undefined;
    if (updatedRaw) {
      const ms = Date.parse(updatedRaw);
      if (Number.isFinite(ms)) publishedAtMs = ms;
    }

    out.push({ title, url, publishedAtMs });
  }

  return out;
}

function isAtom(xml: string): boolean {
  return /<feed\b/i.test(xml) && /xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/rss+xml,application/atom+xml,text/xml,application/xml,text/plain,*/*",
        "User-Agent": "BasedIntern/0.1 (+https://github.com/Metavibez4L/basedintern)"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRssAtomFeed(feedUrl: string): Promise<NewsItem[]> {
  const xml = await fetchText(feedUrl);
  const entries = isAtom(xml) ? parseAtom(xml) : parseRss(xml);

  return entries
    .filter((e) => e.title && e.url)
    .map((e) => {
      const canonical = canonicalizeUrl(e.url);
      const id = fingerprintNewsItem({ source: "rss", title: e.title, url: canonical });
      return {
        id,
        fingerprint: id,
        source: "rss",
        title: e.title,
        url: canonical,
        publishedAtMs: e.publishedAtMs,
        tags: ["base"],
        facts: [],
        excerpt: undefined,
        summary: undefined
      };
    });
}

export async function fetchGitHubAtomFeed(feedUrl: string): Promise<NewsItem[]> {
  const xml = await fetchText(feedUrl);
  const entries = parseAtom(xml);

  return entries
    .filter((e) => e.title && e.url)
    .map((e) => {
      const canonical = canonicalizeUrl(e.url);
      const id = fingerprintNewsItem({ source: "github", title: e.title, url: canonical });
      return {
        id,
        fingerprint: id,
        source: "github",
        title: e.title,
        url: canonical,
        publishedAtMs: e.publishedAtMs,
        tags: ["base", "release"],
        facts: [],
        excerpt: undefined,
        summary: undefined
      };
    });
}

export function safeUrlList(csv: string): string[] {
  return csv
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        // eslint-disable-next-line no-new
        new URL(u);
        return true;
      } catch {
        logger.warn("news.feed invalid url", { url: u });
        return false;
      }
    });
}

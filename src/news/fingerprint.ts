import crypto from "node:crypto";

export function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const STRIP_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "ref",
  "source",
  "campaign",
  "mc_cid",
  "mc_eid"
]);

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";

    // Normalize host casing
    url.hostname = url.hostname.toLowerCase();

    // Strip known tracking params
    for (const key of Array.from(url.searchParams.keys())) {
      if (STRIP_QUERY_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    // Sort params to stabilize fingerprint
    const params = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [k, v] of params) url.searchParams.append(k, v);

    // Normalize trailing slash (keep "/" root)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    // If URL parsing fails, fall back to a conservative trimmed string.
    return rawUrl.trim();
  }
}

export function fingerprintNewsItem(args: { source: string; title: string; url: string }): string {
  const normalizedTitle = normalizeTitle(args.title);
  const canonicalUrl = canonicalizeUrl(args.url);
  const data = `${args.source}|${normalizedTitle}|${canonicalUrl}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

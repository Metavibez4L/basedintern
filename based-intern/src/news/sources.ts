import type { NewsSourceId, ParsedNewsResult } from "./types.js";

/**
 * Legacy HTML news sources (base_blog, base_dev_blog, cdp_launches) have been
 * removed — all returned 403 Forbidden as of 2026-02-06.
 *
 * Primary news source is now the X Timeline fetcher (see fetcher.ts).
 * This module is kept for backward compatibility with the legacy news pipeline.
 */

export function allKnownNewsSources(): NewsSourceId[] {
  return ["x_timeline", "cryptopanic"];
}

export function parseNewsSourcesCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function fetchAndParseNewsSource(source: NewsSourceId): Promise<ParsedNewsResult> {
  // All HTML sources removed — X timeline and CryptoPanic are handled by fetcher.ts
  return { source, items: [], errors: ["source handled by fetcher pipeline"] };
}

import crypto from "node:crypto";

import type { NewsItem } from "./types.js";

function utcDayKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function truncateTo240(s: string): string {
  if (s.length <= 240) return s;
  const suffix = "…";
  return s.slice(0, 240 - suffix.length).trimEnd() + suffix;
}

export function shouldIncludeNfaDisclaimer(nowMs: number, fingerprint: string | undefined): boolean {
  // Deterministic 1-in-5 based on day + fingerprint.
  const day = utcDayKey(nowMs);
  const key = `${day}|${fingerprint ?? ""}`;
  const fp = crypto.createHash("sha256").update(key).digest("hex");
  const n = parseInt(fp.slice(0, 8), 16);
  return n % 5 === 0;
}

function pickFacts(item: NewsItem): string[] {
  const facts = (item.facts ?? []).map((x) => x.trim()).filter(Boolean);
  return facts.slice(0, 2);
}

export function renderDeterministicNewsPost(nowMs: number, item: NewsItem): string {
  const lines: string[] = [];

  // Intern personality; keep it informational.
  lines.push(`based intern memo 🧾 ${item.title}`);

  const facts = pickFacts(item);
  if (facts.length) {
    lines.push(facts.join(" · "));
  }

  lines.push(item.url);

  const nfaKey = item.fingerprint || item.url || item.id;
  if (shouldIncludeNfaDisclaimer(nowMs, nfaKey)) {
    lines.push("NFA.");
  }

  return truncateTo240(lines.join("\n"));
}

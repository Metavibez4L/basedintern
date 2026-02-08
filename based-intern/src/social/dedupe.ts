/**
 * Enhanced content deduplication utilities for social posting.
 * Provides robust similarity checking, fingerprinting, and source tracking.
 */

import crypto from "node:crypto";

/**
 * Normalize text for fingerprinting:
 * - Lowercase
 * - Remove URLs
 * - Remove extra whitespace
 * - Remove common punctuation
 */
export function normalizeForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/[.,!?;:'"()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate a fingerprint for content similarity checking.
 * Uses SHA-256 of normalized content.
 */
export function fingerprintContent(text: string): string {
  const normalized = normalizeForFingerprint(text);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate a similarity fingerprint that captures content "essence"
 * by extracting key phrases and hashing them.
 */
export function generateSimilarityFingerprint(text: string): string {
  const normalized = normalizeForFingerprint(text);
  
  // Extract key content signatures:
  // 1. First 10 words (opening)
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  const opening = words.slice(0, 10).join(" ");
  
  // 2. Key topic words (longer words carry more meaning)
  const keyWords = words
    .filter(w => w.length > 4)
    .sort()
    .slice(0, 8)
    .join(" ");
  
  // 3. Content length bucket (very different lengths = different content)
  const lengthBucket = Math.floor(normalized.length / 50).toString();
  
  const signature = `${opening}|${keyWords}|${lengthBucket}`;
  return crypto.createHash("sha256").update(signature).digest("hex");
}

/**
 * Calculate simple content similarity (0-1 scale).
 * 1 = identical, 0 = completely different
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const fp1 = normalizeForFingerprint(text1);
  const fp2 = normalizeForFingerprint(text2);
  
  if (fp1 === fp2) return 1.0;
  
  const words1 = new Set(fp1.split(/\s+/));
  const words2 = new Set(fp2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Check if content is too similar to any of the recent fingerprints.
 * Returns true if content is too similar (should be rejected).
 */
export function isTooSimilar(
  content: string,
  recentFingerprints: string[],
  similarityThreshold = 0.75
): boolean {
  if (recentFingerprints.length === 0) return false;
  
  for (const recent of recentFingerprints) {
    const similarity = calculateSimilarity(content, recent);
    if (similarity >= similarityThreshold) {
      return true;
    }
  }
  return false;
}

/**
 * Get the most recently used items from an LRU array.
 */
export function getRecentItems<T>(items: T[], count: number): T[] {
  return items.slice(-count);
}

/**
 * Check if a template index was recently used.
 */
export function wasRecentlyUsed(index: number, recentIndices: number[], lookback = 3): boolean {
  return recentIndices.slice(-lookback).includes(index);
}

/**
 * Pick a random index that wasn't recently used.
 * Falls back to random if all options exhausted.
 */
export function pickNonRecentIndex(
  totalTemplates: number,
  recentIndices: number[],
  lookback = 3
): number {
  const available: number[] = [];
  
  for (let i = 0; i < totalTemplates; i++) {
    if (!wasRecentlyUsed(i, recentIndices, lookback)) {
      available.push(i);
    }
  }
  
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  
  // All templates were recently used, just pick random
  return Math.floor(Math.random() * totalTemplates);
}

/**
 * Extract key topics/keywords from text for topic-based deduplication.
 * Returns sorted array of significant words (4+ chars).
 */
export function extractTopics(text: string): string[] {
  const normalized = text.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  
  const words = normalized.split(/\s+/)
    .filter(w => w.length >= 4)
    .filter(w => !STOP_WORDS.has(w));
  
  return [...new Set(words)].sort();
}

/**
 * Calculate topic overlap between two texts (0-1 scale).
 * High overlap means similar subject matter.
 */
export function calculateTopicOverlap(text1: string, text2: string): number {
  const topics1 = new Set(extractTopics(text1));
  const topics2 = new Set(extractTopics(text2));
  
  if (topics1.size === 0 || topics2.size === 0) return 0;
  
  const intersection = new Set([...topics1].filter(t => topics2.has(t)));
  const union = new Set([...topics1, ...topics2]);
  
  return intersection.size / union.size;
}

/**
 * Common English stop words to exclude from topic extraction.
 */
const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "all", "also", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "did", "do", "does", "doing", "don",
  "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
  "having", "here", "how", "if", "into", "its", "itself", "just", "more", "most",
  "no", "nor", "not", "now", "off", "once", "only", "other", "our", "ours",
  "out", "over", "own", "same", "should", "so", "some", "such", "than", "that",
  "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "this", "those", "through", "too", "under", "until", "up", "very", "was", "were",
  "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with",
  "would", "you", "your", "yours", "yourself", "yourselves", "based", "intern",
  "agent", "pool", "liquidity", "trade", "trading"
]);

/**
 * Shared utility functions for the based-intern agent.
 * Extracted to avoid duplication across modules.
 */

/**
 * Sleep for a specified number of milliseconds.
 * Returns a promise that resolves after the timeout.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep with early wakeup capability.
 * Returns a promise that resolves after the timeout, and a function to resolve early.
 */
export function interruptibleSleep(ms: number): {
  promise: Promise<void>;
  wake: () => void;
} {
  let wakeFn: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      wakeFn = null;
      resolve();
    }, ms);
    wakeFn = () => {
      clearTimeout(t);
      wakeFn = null;
      resolve();
    };
  });
  return {
    promise,
    wake: () => wakeFn?.()
  };
}

/**
 * Format a number as a compact string (K, M, B suffixes).
 */
export function formatCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simple in-memory cache with TTL.
 */
export class TTLCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();

  constructor(private defaultTtlMs: number = 30000) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }
}

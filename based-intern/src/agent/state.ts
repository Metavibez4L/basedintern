import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AgentState = {
  lastExecutedTradeAtMs: number | null;
  // UTC day key, e.g. "2026-01-29"
  dayKey: string;
  tradesExecutedToday: number;
  // X API circuit breaker
  xApiFailureCount: number;
  xApiCircuitBreakerDisabledUntilMs: number | null;
  // Idempotency: fingerprint of last posted receipt
  lastPostedReceiptFingerprint: string | null;
};

export const DEFAULT_STATE: AgentState = {
  lastExecutedTradeAtMs: null,
  dayKey: utcDayKey(new Date()),
  tradesExecutedToday: 0,
  xApiFailureCount: 0,
  xApiCircuitBreakerDisabledUntilMs: null,
  lastPostedReceiptFingerprint: null
};

export function statePath(): string {
  return path.join(process.cwd(), "data", "state.json");
}

export async function loadState(): Promise<AgentState> {
  const p = statePath();
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentState>;
    const merged: AgentState = {
      lastExecutedTradeAtMs: parsed.lastExecutedTradeAtMs ?? null,
      dayKey: parsed.dayKey ?? utcDayKey(new Date()),
      tradesExecutedToday: parsed.tradesExecutedToday ?? 0,
      xApiFailureCount: parsed.xApiFailureCount ?? 0,
      xApiCircuitBreakerDisabledUntilMs: parsed.xApiCircuitBreakerDisabledUntilMs ?? null,
      lastPostedReceiptFingerprint: parsed.lastPostedReceiptFingerprint ?? null
    };

    // Reset daily counter if the day rolled over.
    const today = utcDayKey(new Date());
    if (merged.dayKey !== today) {
      merged.dayKey = today;
      merged.tradesExecutedToday = 0;
    }

    return merged;
  } catch {
    // Create folder lazily.
    await ensureStateDir();
    await saveState(DEFAULT_STATE);
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state: AgentState): Promise<void> {
  await ensureStateDir();
  const p = statePath();
  await writeFile(p, JSON.stringify(state, null, 2), "utf8");
}

export async function recordExecutedTrade(state: AgentState, at: Date): Promise<AgentState> {
  const next: AgentState = { ...state };
  const today = utcDayKey(at);
  if (next.dayKey !== today) {
    next.dayKey = today;
    next.tradesExecutedToday = 0;
  }
  next.tradesExecutedToday += 1;
  next.lastExecutedTradeAtMs = at.getTime();
  await saveState(next);
  return next;
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function ensureStateDir(): Promise<void> {
  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
}


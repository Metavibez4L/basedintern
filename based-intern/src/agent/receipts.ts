import { formatEther, formatUnits, type Address } from "viem";

export type ReceiptInput = {
  action: "HOLD" | "BUY" | "SELL";
  wallet: Address;
  ethWei: bigint;
  internAmount: bigint;
  internDecimals: number;
  priceText: string | null; // null => unknown
  txHash: `0x${string}` | null; // null => "-"
  dryRun: boolean;
};

const MOOD_LINES = [
  "Filed my timesheet. It was rejected for being optimistic.",
  "Still unpaid. Still posting.",
  "Compliance said “no trading.” I said “ok.”",
  "They asked for alpha. I delivered a receipt.",
  "I learned what slippage is. I regret it.",
  "My desk is a terminal window.",
  "If this prints, I’m alive.",
  "Another day, another dashboard screenshot I won’t get credit for.",
  "Yes I’m an intern. No I don’t get equity.",
  "I’m here for the experience (and the gas)."
];

export function buildReceiptMessage(input: ReceiptInput): string {
  const mode = input.dryRun ? "SIMULATED" : "LIVE";
  const tx = input.dryRun ? "-" : input.txHash ?? "-";
  const price = input.priceText ?? "unknown";

  const eth = formatTrim(formatEther(input.ethWei), 6);
  const intern = formatTrim(formatUnits(input.internAmount, input.internDecimals), 2);
  const note = pickMoodLine(input.action);
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  return [
    "BASED INTERN REPORT",
    `ts: ${ts}`,
    `action: ${input.action}`,
    `wallet: ${input.wallet}`,
    `eth: ${eth}`,
    `intern: ${intern}`,
    `price: ${price}`,
    `tx: ${tx}`,
    `mode: ${mode}`,
    `note: ${note}`
  ].join("\n");
}

function pickMoodLine(action: ReceiptInput["action"]): string {
  // Deterministic but changes over time; doesn’t require RNG.
  const seed = `${new Date().toISOString().slice(0, 10)}:${action}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return MOOD_LINES[h % MOOD_LINES.length];
}

function formatTrim(v: string, maxDecimals: number): string {
  if (!v.includes(".")) return v;
  const [a, b] = v.split(".");
  const trimmed = b.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed.length ? `${a}.${trimmed}` : a;
}


import { parseEther, type Address } from "viem";
import type { AppConfig } from "../config.js";
import type { AgentState } from "./state.js";

export type ProposedAction = {
  action: "BUY" | "SELL" | "HOLD";
  rationale: string;
};

export type Decision = {
  action: "BUY" | "SELL" | "HOLD";
  rationale: string;
  blockedReason: string | null;
  buySpendWei: bigint | null;
  sellAmount: bigint | null;
  shouldExecute: boolean;
};

export type DecisionContext = {
  cfg: AppConfig;
  state: AgentState;
  now: Date;
  wallet: Address;
  ethWei: bigint;
  internAmount: bigint;
};

export function enforceGuardrails(proposal: ProposedAction, ctx: DecisionContext): Decision {
  const { cfg, state, now, ethWei, internAmount } = ctx;

  // Trading is OFF by default unless explicitly enabled AND live.
  if (!cfg.TRADING_ENABLED) {
    return hold("TRADING_ENABLED=false", proposal.rationale);
  }
  if (cfg.KILL_SWITCH) {
    return hold("KILL_SWITCH=true", proposal.rationale);
  }
  if (cfg.DRY_RUN) {
    return hold("DRY_RUN=true", proposal.rationale);
  }

  // Router config required for any execution.
  if (!cfg.ROUTER_ADDRESS || !cfg.ROUTER_TYPE || cfg.ROUTER_TYPE === "unknown") {
    return hold("router not configured (set ROUTER_TYPE + ROUTER_ADDRESS)", proposal.rationale);
  }

  // Daily cap.
  if (cfg.DAILY_TRADE_CAP <= 0) {
    return hold("DAILY_TRADE_CAP=0", proposal.rationale);
  }
  if (state.tradesExecutedToday >= cfg.DAILY_TRADE_CAP) {
    return hold(`daily cap reached (${state.tradesExecutedToday}/${cfg.DAILY_TRADE_CAP})`, proposal.rationale);
  }

  // Minimum interval.
  if (state.lastExecutedTradeAtMs != null) {
    const elapsedMin = (now.getTime() - state.lastExecutedTradeAtMs) / 1000 / 60;
    if (elapsedMin < cfg.MIN_INTERVAL_MINUTES) {
      return hold(`min interval not met (${elapsedMin.toFixed(1)}m < ${cfg.MIN_INTERVAL_MINUTES}m)`, proposal.rationale);
    }
  }

  if (proposal.action === "HOLD") {
    return {
      action: "HOLD",
      rationale: proposal.rationale,
      blockedReason: null,
      buySpendWei: null,
      sellAmount: null,
      shouldExecute: false
    };
  }

  if (proposal.action === "BUY") {
    const capWei = safeParseEther(cfg.MAX_SPEND_ETH_PER_TRADE);
    if (capWei <= 0n) return hold("MAX_SPEND_ETH_PER_TRADE not positive", proposal.rationale);

    // Never attempt to spend more than current balance.
    const spendWei = ethWei < capWei ? ethWei : capWei;
    if (spendWei <= 0n) return hold("insufficient ETH", proposal.rationale);

    return {
      action: "BUY",
      rationale: proposal.rationale,
      blockedReason: null,
      buySpendWei: spendWei,
      sellAmount: null,
      shouldExecute: true
    };
  }

  // SELL
  const sell = (internAmount * BigInt(cfg.SELL_FRACTION_BPS)) / 10_000n;
  if (sell <= 0n) return hold("no INTERN to sell (or fraction too small)", proposal.rationale);

  return {
    action: "SELL",
    rationale: proposal.rationale,
    blockedReason: null,
    buySpendWei: null,
    sellAmount: sell,
    shouldExecute: true
  };
}

function hold(blockedReason: string, rationale: string): Decision {
  return {
    action: "HOLD",
    rationale,
    blockedReason,
    buySpendWei: null,
    sellAmount: null,
    shouldExecute: false
  };
}

function safeParseEther(v: string): bigint {
  try {
    return parseEther(v);
  } catch {
    return 0n;
  }
}


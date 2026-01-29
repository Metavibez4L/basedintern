import type { Address } from "viem";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { BASED_INTERN_SYSTEM_PROMPT } from "./prompt.js";
import type { ProposedAction } from "./decision.js";
import { buildTools } from "./tools.js";

export type BrainContext = {
  wallet: Address;
  ethWei: bigint;
  internAmount: bigint;
  internDecimals: number;
  priceText: string | null;
};

/**
 * Returns an action proposal.
 *
 * - If OPENAI_API_KEY is present, we ask an LLM via LangChain (best-effort).
 * - Otherwise we use a deterministic fallback policy.
 *
 * Guardrails are enforced elsewhere regardless of this output.
 */
export async function proposeAction(cfg: AppConfig, ctx: BrainContext): Promise<ProposedAction> {
  if (cfg.OPENAI_API_KEY) {
    try {
      return await proposeWithLangChain(cfg, ctx);
    } catch (err) {
      logger.warn("LLM propose failed; using fallback policy", {
        error: err instanceof Error ? err.message : String(err)
      });
      return fallbackPolicy(cfg, ctx);
    }
  }
  return fallbackPolicy(cfg, ctx);
}

function fallbackPolicy(cfg: AppConfig, ctx: BrainContext): ProposedAction {
  // Deterministic and conservative. This runs even without OPENAI_API_KEY.
  // It can propose BUY/SELL only when operator has explicitly opted into LIVE trading.
  if (!cfg.TRADING_ENABLED || cfg.KILL_SWITCH || cfg.DRY_RUN) {
    return { action: "HOLD", rationale: "Safety mode active (or trading disabled). Holding." };
  }

  if (ctx.internAmount === 0n) {
    return { action: "BUY", rationale: "No INTERN balance. Proposing a tiny buy (guardrails will cap)." };
  }

  return { action: "SELL", rationale: "Have INTERN balance. Proposing a small sell (fraction capped)." };
}

async function proposeWithLangChain(cfg: AppConfig, ctx: BrainContext): Promise<ProposedAction> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const { HumanMessage, SystemMessage, ToolMessage } = await import("@langchain/core/messages");

  const baseModel = new ChatOpenAI({
    apiKey: cfg.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    temperature: 0.2
  });

  const tools = buildTools(cfg, ctx);
  const model = baseModel.bindTools(tools);

  const messages: any[] = [
    new SystemMessage(BASED_INTERN_SYSTEM_PROMPT),
    new HumanMessage(
      [
        "Call `get_context` first.",
        "Then respond with ONLY valid JSON:",
        '{ "action": "BUY"|"SELL"|"HOLD", "rationale": "..." }'
      ].join("\n")
    )
  ];

  // Simple tool-calling loop (no external agent executor needed).
  for (let i = 0; i < 3; i++) {
    const res: any = await model.invoke(messages);
    messages.push(res);

    const toolCalls: Array<any> | undefined =
      res.tool_calls ?? res.additional_kwargs?.tool_calls ?? res.additional_kwargs?.toolCalls;

    if (toolCalls && toolCalls.length) {
      for (const call of toolCalls) {
        const name: string | undefined = call.name ?? call.function?.name;
        const id: string | undefined = call.id ?? call.tool_call_id;
        const argsRaw = call.args ?? call.function?.arguments ?? {};

        const tool = tools.find((t: any) => t.name === name);
        if (!tool || !id) continue;

        const args = typeof argsRaw === "string" ? safeParseArgs(argsRaw) : argsRaw;
        const out = await tool.invoke(args ?? {});
        messages.push(new ToolMessage({ tool_call_id: id, content: String(out) }));
      }
      continue;
    }

    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = safeParseJsonObject(text);

    const action = parsed?.action;
    const rationale = parsed?.rationale;

    if (action === "BUY" || action === "SELL" || action === "HOLD") {
      return { action, rationale: typeof rationale === "string" && rationale.trim() ? rationale : "LLM proposal." };
    }

    throw new Error("LLM output missing valid {action,rationale} JSON");
  }

  throw new Error("LLM did not produce a final answer after tool calls");
}

function safeParseJsonObject(text: string): any | null {
  // Try exact JSON first.
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj;
  } catch {
    // ignore
  }
  // Try to extract a JSON object substring.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (obj && typeof obj === "object") return obj;
    } catch {
      // ignore
    }
  }
  return null;
}

function safeParseArgs(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}


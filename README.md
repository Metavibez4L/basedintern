# Based Intern

Based Intern is a TypeScript + Solidity agent that posts proof-of-life receipts and can execute capped trades on Base (Sepolia/mainnet). It’s designed to be safety-first: deterministic fallbacks, multiple independent guardrails, and “keep running even when dependencies fail”.

## ✨ Features

- **Receipts (proof-of-life):** posts balances, price (best-effort), action, and mode.
- **Safety-first trading:** hard caps on daily trades, spend per trade, and minimum interval.
- **Deterministic fallback:** if LLM/RPC/price fails, the agent continues conservatively.
- **Dual social posting:** `SOCIAL_MODE=none|playwright|x_api`.
- **Phase 1 mentions poller:** intent recognition + replies (no execution).
- **Base News Brain:** optional AI-generated (or deterministic) news commentary with strict dedupe + caps.

## 🛡️ Safety Model

Three independent safety layers (all must pass for live trading):

1. **Config validation:** Zod schema + guardrail checks at startup.
2. **Proposal fallback:** if LLM fails/unavailable, fall back to a conservative policy.
3. **Execution guardrails:** hard caps enforced before any onchain action.

Critical flags (AND logic) for live trading:

- `TRADING_ENABLED=true` (default: false)
- `KILL_SWITCH=false` (default: true)
- `DRY_RUN=false` (default: true)
- `ROUTER_ADDRESS` configured

## 🗞️ Base News Brain

Based Intern can optionally post commentary about Base ecosystem news.

Safety guarantees:

- **Must include source URL:** every news post includes the chosen item’s URL.
- **Dedupe:** LRU fingerprinting prevents reposting the same item.
- **Daily caps + interval:** enforced via persisted state.
- **Non-blocking:** news failures are logged and do not break the tick.

Supported sources:

- `base_blog` → https://blog.base.org/
- `base_dev_blog` → https://blog.base.dev/
- `cdp_launches` → https://www.coinbase.com/developer-platform/discover/launches

## 🚀 Quickstart

```bash
cd based-intern
npm install
npm run build
npm test

# Run agent in safe mode
npm run dev
```

## ⚙️ Configuration

See [based-intern/.env.example](based-intern/.env.example). Safe defaults are:

```bash
DRY_RUN=true
TRADING_ENABLED=false
KILL_SWITCH=true
SOCIAL_MODE=none
```

Enable news (safe logging):

```bash
NEWS_ENABLED=true
SOCIAL_MODE=none
```

Enable news posting (X API):

```bash
NEWS_ENABLED=true
SOCIAL_MODE=x_api
```

## 📚 Documentation

- [based-intern/README.md](based-intern/README.md) — Developer guide
- [based-intern/docs/FLOW.md](based-intern/docs/FLOW.md) — Execution flow
- [based-intern/docs/STATUS.md](based-intern/docs/STATUS.md) — Feature status

## 📝 License

MIT

## Security Warning

Use a fresh wallet with minimal funds. Never commit secrets. Keep safety caps conservative.


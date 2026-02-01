# Based Intern

Based Intern is a TypeScript + Solidity agent that posts proof-of-life receipts and can execute capped trades on Base (Sepolia/mainnet). It’s designed to be safety-first: deterministic fallbacks, multiple independent guardrails, and “keep running even when dependencies fail”.

This repo includes **LIVE Base mainnet (chainId 8453) deployments** (token + optional ERC-8004 identity). Treat all mainnet addresses and trading configuration as production.

## ✨ Features

- **Receipts (proof-of-life):** posts balances, price (best-effort), action, and mode.
- **Safety-first trading:** hard caps on daily trades, spend per trade, and minimum interval.
- **Deterministic fallback:** if LLM/RPC/price fails, the agent continues conservatively.
- **Social posting:** `SOCIAL_MODE=none|playwright|x_api|moltbook|multi` (fanout posts to multiple targets).
- **Phase 1 mentions poller:** intent recognition + replies (no execution).
- **Base News Brain:** optional AI-generated (or deterministic) news commentary with strict dedupe + caps.
- **(Optional) ERC-8004 identity:** on-chain agent registry id + wallet binding.

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

## 💱 Trading (Full Power, Off by Default)

Trading is optional and defaults to safe mode, but when enabled Based Intern can execute real onchain swaps with multiple layers of protection.

**What trading can do**

- **Buy / Sell execution** on Base via router integrations (currently Aerodrome).
- **Best-effort pricing** using the DEX provider registry (used for decisions + receipts).
- **Slippage protection** via `SLIPPAGE_BPS` to compute `amountOutMin`.
- **Hard guardrails enforced before execution**: daily cap, min interval, max spend per trade, sell fraction caps.
- **Approval orchestration (sells)**: reads allowance and submits ERC20 approvals when needed (configurable).
- **Receipts + audit trail**: every action is surfaced in the receipt (mode, balances, and tx hash when executed).

**How to enable live trading (only after you’ve run in safe mode)**

1. Run posting-only first: `DRY_RUN=true`, `TRADING_ENABLED=false`, `KILL_SWITCH=true`.
2. Configure router + pool.
3. Flip to live: `DRY_RUN=false`, `TRADING_ENABLED=true`, `KILL_SWITCH=false`.

Example Aerodrome config:

```bash
TRADING_ENABLED=true
KILL_SWITCH=false
DRY_RUN=false

ROUTER_TYPE=aerodrome
ROUTER_ADDRESS=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
POOL_ADDRESS=0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc
WETH_ADDRESS=0x4200000000000000000000000000000000000006
AERODROME_STABLE=false

DAILY_TRADE_CAP=2
MIN_INTERVAL_MINUTES=60
MAX_SPEND_ETH_PER_TRADE=0.0005
SELL_FRACTION_BPS=500
SLIPPAGE_BPS=300

APPROVE_MAX=false
APPROVE_CONFIRMATIONS=1
```

## 🗞️ Base News Brain

Based Intern can optionally post commentary about Base ecosystem news.

Safety guarantees:

- **Must include source URL:** every news post includes the chosen item’s URL.
- **Dedupe:** LRU fingerprinting prevents reposting the same item.
- **Daily caps + interval:** enforced via persisted state.
- **Non-blocking:** news failures are logged and do not break the tick.

Supported sources:

- `defillama` → DeFiLlama Base snapshot (TVL + top protocols)
- `rss` → RSS/Atom feeds (configure via `NEWS_FEEDS`)
- `github` → GitHub Atom feeds (configure via `NEWS_GITHUB_FEEDS`)
- `base_blog` → https://blog.base.org/
- `base_dev_blog` → https://blog.base.dev/
- `cdp_launches` → https://www.coinbase.com/developer-platform/discover/launches

Quick enable (log-only):

```bash
NEWS_ENABLED=true
SOCIAL_MODE=none

# choose sources
NEWS_SOURCES=defillama,github,rss

# required when rss/github enabled
NEWS_FEEDS="https://example.com/feed.xml"
NEWS_GITHUB_FEEDS="https://github.com/base-org/node/releases.atom"
```

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
- [based-intern/docs/BUILD.md](based-intern/docs/BUILD.md) — Build & deployment
- [based-intern/docs/FLOW.md](based-intern/docs/FLOW.md) — Execution flow
- [based-intern/docs/STATUS.md](based-intern/docs/STATUS.md) — Feature status
- [based-intern/docs/MOLTBOOK.md](based-intern/docs/MOLTBOOK.md) — Moltbook bootstrap + posting

## ✅ Live Identities

This agent has two independent “proof” surfaces:

- **ERC-8004 (on-chain, Base mainnet 8453)**
	- Identity Registry: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
	- Agent ref: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
	- agentURI (pinned): `https://raw.githubusercontent.com/Metavibez4L/basedintern/9a03a383107440d7c6ce360fe2efdce8b151ac40/based-intern/docs/agent.profile.json`

- **Moltbook (off-chain, claimed)**
	- Agent name: `BasedIntern_wi5rcx`
	- Verify from your deploy environment: `npm run moltbook:doctor`

## (Optional) ERC-8004 agent identity

If you want receipts to include a portable on-chain identifier, register the agent in the ERC-8004 Identity Registry.

- Registration/profile template JSON: [based-intern/docs/agent.registration.json](based-intern/docs/agent.registration.json)
- Profile-first template JSON (recommended for hosted/IPFS profile): [based-intern/docs/agent.profile.json](based-intern/docs/agent.profile.json)
- Strict/minimal template JSON (schema-first): [based-intern/docs/agent.registration.json](based-intern/docs/agent.registration.json)
- Scripts live under `based-intern/scripts/` and are exposed as npm scripts in `based-intern/package.json`.

### ERC-8004 (Deployed on Base mainnet)

ERC-8004 turns the agent into a **portable on-chain identity**:
- Anyone can independently verify the agent’s canonical id and profile URI on Base.
- The identity can be bound to a wallet (EIP-712 signed) without trusting off-chain claims.
- Receipts can include a stable `Agent:` reference for attribution and monitoring.

Deployed identity (Base mainnet 8453):
- Identity Registry: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
- Agent ref: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
- agentURI (pinned): `https://raw.githubusercontent.com/Metavibez4L/basedintern/9a03a383107440d7c6ce360fe2efdce8b151ac40/based-intern/docs/agent.profile.json`

## Social fanout (X + Moltbook)

To post receipts to both X and Moltbook from a single process:

```bash
SOCIAL_MODE=multi
SOCIAL_MULTI_TARGETS=x_api,moltbook

# X credentials (for x_api)
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...

# Moltbook credentials
MOLTBOOK_ENABLED=true
MOLTBOOK_API_KEY=...
```

## Mainnet warning

If you set `CHAIN=base` and flip `TRADING_ENABLED=true` + `KILL_SWITCH=false` + `DRY_RUN=false`, the agent can submit **real mainnet transactions**. Use a fresh wallet with minimal funds and keep caps conservative.

## 📝 License

MIT

## Security Warning

Use a fresh wallet with minimal funds. Never commit secrets. Keep safety caps conservative.


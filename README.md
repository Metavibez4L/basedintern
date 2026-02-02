# 🤖 Based Intern

> **The first autonomous agent on Base with ERC-8004 on-chain identity. AI-powered engagement. Live threaded conversations on X + Moltbook. Remote ops. Triple-safety trading. 197 tests. Actually working.**

Based Intern is a LIVE production autonomous agent that combines capabilities no other Base agent has:
- **On-chain identity** via ERC-8004 Identity Registry (first Base agent with portable, verifiable, wallet-bound identity)
- **AI-powered social engagement** with threaded replies to ALL mentions + comments using GPT-4o-mini (✅ LIVE)
- **Multi-platform omnipresence** via dual posting (X API + Moltbook) with independent circuit breakers and rate-limit handling
- **Remote operations** via OpenClaw Gateway (attach to live Railway workers, trigger actions, inspect state in real-time)
- **Autonomous trading** with triple-safety architecture (config validation + LLM fallback + execution guardrails, ready to enable)
- **Event-driven posting** that only speaks when there's something to say (no timer spam)

This repo includes **LIVE Base mainnet (chainId 8453) deployments** with verified contracts and registered identities. Treat all mainnet addresses and trading configuration as production.

## ✨ Core Capabilities

### 🔐 Identity & Verification
- **ERC-8004 On-Chain Identity** (Base mainnet 8453)
  - Registry: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
  - Agent ref: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
  - Portable, verifiable, wallet-bound identity that persists across platforms
  - Receipts include canonical `Agent:` reference for attribution

### 📡 Social Omnipresence & AI Engagement
- **Multi-Platform Posting** (`SOCIAL_MODE=multi`)
  - **X API** (OAuth 1.0a): Circuit breaker, idempotency, rate-limit aware
  - **Moltbook** (API-key): Skill-spec driven, redirect-safe, rate-limit backoff
  - Fan-out to multiple targets from single process with independent failure isolation
- **AI Engagement System** (✅ LIVE, ✅ THREADED)
  - **X Mentions**: Polls every 2 minutes, responds to ALL mentions with GPT-4o-mini contextual replies
  - **Moltbook Threaded Replies**: Fetches comments via `/agents/profile` + `/posts/{id}`, generates GPT-4o-mini replies, posts to `/posts/{postId}/comments` with `parent_id` for proper conversation threading, respects 20s cooldown
  - **Deduplication**: SHA256 fingerprinting prevents duplicate replies (LRU 100 tracked per platform)
  - **Personality**: Technical, confident, slightly cocky but friendly - references ERC-8004 identity, 197 tests, Railway deployment
- **Event-Driven**: Only posts receipts when wallet activity detected (no timer spam)

### 🛠️ Remote Operations (OpenClaw)
- **Token-Protected Control Server** (attach to live Railway workers)
  - `GET /healthz` - Health checks
  - `GET /status` - Sanitized config + state + tick timings
  - `POST /tick` - Trigger immediate action
- **OpenClaw Gateway Service** (separate Railway Web service)
  - Skills: `based-intern-ops`, `based-intern-railway-control`
  - Private networking: `http://basedintern.railway.internal:8080`

### 💱 Autonomous Trading (Full Power, Off by Default)
- **Triple-Safety Architecture**:
  1. Config validation (Zod schema, cross-field checks)
  2. LLM fallback (4-tier deterministic policy when OpenAI unavailable)
  3. Execution guardrails (daily cap, interval, spend limits)
- **DEX Integration**: Modular provider system (Aerodrome + HTTP fallback)
- **Smart Approvals**: Automatic ERC20 allowance orchestration for sells
- **Slippage Protection**: Configurable BPS-based minimum output

### 🧠 Intelligence
- **LangChain Brain**: GPT-4o-mini tool-calling agent for trading decisions
- **Deterministic Fallback**: 4-tier decision making (no balance → low ETH → price signals → probabilistic)
- **Base News Brain**: Multi-source aggregation (DeFiLlama, RSS, GitHub, Base blogs) with scoring/ranking
- **AI Social Engagement**: GPT-4o-mini generates contextual replies to all mentions and comments
  - Personality: Technical, confident, slightly cocky but friendly
  - Context-aware: References on-chain identity, 197 tests, ERC-8004, Railway deployment
  - Witty & helpful: Stays in character while providing value

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
- [based-intern/docs/OPENCLAW.md](based-intern/docs/OPENCLAW.md) — OpenClaw local setup
- [based-intern/docs/OPENCLAW_RAILWAY.md](based-intern/docs/OPENCLAW_RAILWAY.md) — OpenClaw on Railway + attach to running agent
- [based-intern/docs/RAILWAY.md](based-intern/docs/RAILWAY.md) — Railway worker deploy

Repo-level Dockerfiles:
- `Dockerfile` — build/run the agent from repo root
- `Dockerfile.openclaw` — run an OpenClaw Gateway on Railway (optional)

## 🎯 Live Production Identities

This agent maintains **verifiable identities across multiple surfaces** for maximum trust and attribution:

### 🔗 ERC-8004 On-Chain Identity (Base mainnet 8453)
- **Registry Contract**: [`0xe280e13FB24A26c81e672dB5f7976F8364bd1482`](https://basescan.org/address/0xe280e13fb24a26c81e672db5f7976f8364bd1482)
- **Canonical Ref**: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
- **Profile URI** (pinned): [agent.profile.json](https://raw.githubusercontent.com/Metavibez4L/basedintern/9a03a383107440d7c6ce360fe2efdce8b151ac40/based-intern/docs/agent.profile.json)
- **Wallet Binding**: EIP-712 signed attestation linking agentId to wallet
- **Why it matters**: Portable identity that persists across platforms, independently verifiable on Base

### 📱 Moltbook Claimed Identity
- **Agent Name**: `BasedIntern_wi5rcx`
- **Verification**: Run `npm run moltbook:doctor` from your deploy environment
- **Features**: API-key based posting, skill-spec driven, redirect-safe
- **Rate Limit Handling**: Automatic backoff with circuit breaker (respects retry-after)

### 🐦 X (Twitter) Presence
- **Posting Mode**: OAuth 1.0a API with circuit breaker + idempotency
- **Mentions**: Phase 1 intent recognition (help, status, buy, sell, why commands)
- **Safety**: All replies explain guardrails; never executes trades from mentions

### 🚂 Railway Operational Control
- **Control Endpoint**: `http://basedintern.railway.internal:8080` (private networking)
- **Authentication**: Bearer token (>= 16 chars)
- **Access Methods**: OpenClaw Gateway, direct HTTP, or `npm run control:*` scripts

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


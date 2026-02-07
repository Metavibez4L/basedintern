# 🤖 Based Intern

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║   ░█▀▄░█▀█░█▀▀░█▀▀░█▀▄░░░▀█▀░█▀█░▀█▀░█▀▀░█▀▄░█▀█                        ║
║   ░█▀▄░█▀█░▀▀█░█▀▀░█░█░░░░█░░█░█░░█░░█▀▀░█▀▄░█░█                        ║
║   ░▀▀░░▀░▀░▀▀▀░▀▀▀░▀▀░░░░▀▀▀░▀░▀░░▀░░▀▀▀░▀░▀░▀░▀                        ║
║                                                                            ║
║   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ║
║                                                                            ║
║   > SYSTEM ONLINE                                                          ║
║   > AUTONOMOUS AI AGENT ░░ BASE L2 ░░ ON-CHAIN IDENTITY                   ║
║   > ERC-8004 ░░ AERODROME LP ░░ 218 TESTS ░░ ZERO DOWNTIME                ║
║   > STATUS: ██████████████████████████████████████████████ LIVE             ║
║                                                                            ║
║   ░▒▓█ THE FIRST AUTONOMOUS AGENT ON BASE. ACTUALLY WORKING. █▓▒░         ║
║                                                                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

> **The first autonomous agent on Base with ERC-8004 on-chain identity. AI-powered engagement. Live threaded conversations on X + Moltbook. Remote ops. Triple-safety trading. Autonomous LP. News opinion pipeline. Mini App dashboard. 218 tests. Actually working.**

Based Intern is a LIVE production autonomous agent that combines capabilities no other Base agent has:
- **On-chain identity** via ERC-8004 Identity Registry (first Base agent with portable, verifiable, wallet-bound identity)
- **AI-powered social engagement** with threaded replies to ALL mentions + comments using GPT-4o-mini (✅ LIVE)
- **Multi-platform omnipresence** via dual posting (X API + Moltbook) with independent circuit breakers and rate-limit handling
- **Remote operations** via OpenClaw Gateway (attach to live Railway workers, trigger actions, inspect state in real-time)
- **Autonomous trading** with triple-safety architecture (config validation + LLM fallback + execution guardrails)
- **Autonomous LP** on Aerodrome (INTERN/WETH + INTERN/USDC pools, gauge staking, AERO rewards)
- **News opinion pipeline** — AI-generated takes on Base ecosystem news from X timeline + CryptoPanic
- **Trade announcements** — Community hype posts after every successful trade
- **Content deduplication** — SHA256 fingerprinting prevents repetitive posts across all channels
- **📱 Base Mini App** — Live community dashboard at [basedintern.vercel.app](https://basedintern.vercel.app)
- **Event-driven posting** that only speaks when there's something to say (no timer spam)
- **Production-hardened** with retry logic, timeouts, input validation, atomic state writes, and defensive coding

This repo includes **LIVE Base mainnet (chainId 8453) deployments** with verified contracts and registered identities. Treat all mainnet addresses and trading configuration as production.

---

## 🔴 LIVE Deployment Status

| Field | Status |
|-------|--------|
| **Deployed** | ✅ YES — Railway |
| **Mini App** | ✅ YES — Vercel |
| **Network** | Base mainnet (chainId 8453) |
| **Pool** | INTERN/WETH volatile pool on Aerodrome |
| **Pool Address** | `0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc` |
| **Router** | Aerodrome `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| **Token** | INTERN `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11` |
| **Mini App URL** | [basedintern.vercel.app](https://basedintern.vercel.app) |
| **Status** | 🟢 LIVE |
| **Trading** | ✅ Active — 1 trade/day cap, 0.0005 ETH max spend |
| **LP** | ✅ Active — auto-seed enabled, max 0.001 ETH per add |
| **Social** | ✅ Active — X + Moltbook (multi-target) |
| **News** | ✅ Active — X timeline + opinion generation |
| **Guardrails** | ✅ All active — KILL_SWITCH, daily caps, slippage limits |
| **Tests** | ✅ 218 passing |

**Loop Configuration:**
- Interval: 30 minutes
- Daily trade cap: 1
- Max spend per trade: 0.0005 ETH
- Slippage: 300 BPS
- LP max per add: 0.001 ETH
- LP max token fraction: 1000 BPS

---

## 📱 INTERN Base Mini App

The **INTERN Base Mini App** is a live community dashboard inside Coinbase Wallet and the Base App:

**Live URL:** [basedintern.vercel.app](https://basedintern.vercel.app)

### Features
- 📊 **Live agent stats** — trades today, LP share, social posts, uptime
- 💰 **Real-time $INTERN price** — pulled directly from Aerodrome pool
- 🔄 **In-app token swap** — Swap WETH ↔ INTERN via OnchainKit Swap component
- 🏊 **Pool data** — TVL, reserves, agent's LP position
- 📜 **Action feed** — Real-time log of trades, LP operations, social posts, news
- 🔔 **Push notifications** — Opt-in alerts for trade executions and major events

### Tech Stack
- **Framework:** Next.js 15 + React + TypeScript
- **Chain:** Base mainnet (chainId 8453)
- **Wallet:** Coinbase Wallet integration via MiniKit
- **Swap:** OnchainKit Swap component (Aerodrome routing)
- **Hosting:** Vercel (edge network)
- **Styling:** Tailwind CSS with neon blue cyber aesthetic

### Mini App Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| **INTERN Token** | `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11` |
| **WETH** | `0x4200000000000000000000000000000000000006` |
| **Pool (INTERN/WETH)** | `0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc` |
| **Router (Aerodrome)** | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |

### Mini App API Endpoints

The mini app connects to the agent's control server for live data:

| Endpoint | Auth | Description | Caching |
|----------|------|-------------|---------|
| `GET /api/stats` | None | Agent status, trades today, uptime | 30s TTL |
| `GET /api/pool` | None | Pool TVL, reserves, INTERN price | 30s TTL |
| `GET /api/feed` | None | Action log (50-entry ring buffer) | Real-time |
| `GET /api/token` | None | Token price, supply, decimals | 30s TTL |

### Mini App Setup (Local Development)

```bash
cd miniapp
npm install

# Development
cp .env.example .env.local
# Add your CDP API key: NEXT_PUBLIC_CDP_CLIENT_API_KEY=
npm run dev

# Production build
npx next build
```

---

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
  - **Trade Announcements**: Community hype posts fired after every successful trade (BUY/SELL)
  - **Content Deduplication**: SHA256 fingerprinting + similarity checking prevents repetitive posts (LRU 200 tracked per platform)
  - **Personality**: Technical, confident, slightly cocky but friendly - references ERC-8004 identity, 218 tests, Railway deployment

### 🗞️ News Opinion Pipeline
- **Multi-Source News Aggregation**
  - X Timeline (primary): Watches `@base`, `@buildonbase`, `@openclaw` for real-time news
  - CryptoPanic: Hot crypto news (optional, requires API key)
- **AI Opinion Generation**: GPT-4o-mini analyzes top stories and generates hot takes
- **Relevance Scoring**: Configurable threshold (default 0.5) filters low-quality opinions
- **Dual-Layer Dedupe**: Article IDs + canonical URL fingerprints prevent re-posting
- **Daily Caps**: Max posts per day enforced via persisted state
- **Circuit Breaker**: Auto-disables after 3 consecutive failures (30-min cooldown)

### 🏊 Autonomous Liquidity Provision
- **Aerodrome LP Management** (behind `LP_ENABLED` flag)
  - INTERN/WETH pool: add/remove liquidity with native ETH
  - INTERN/USDC pool: add/remove liquidity with ERC20 pairs
  - Gauge staking for AERO rewards (auto-stake, auto-claim)
  - Pool health monitoring (reserves, TVL, share %)
  - Auto-seed when pool TVL < 1 ETH
- **LP Social Campaign**: Status posts, guides, milestones, comparisons, incentive posts
- **Guardrails**: `LP_MAX_ETH_PER_ADD`, `LP_MAX_TOKEN_FRACTION_BPS`, `LP_SLIPPAGE_BPS`

### 💱 Autonomous Trading (Full Power, Off by Default)
- **Triple-Safety Architecture**:
  1. Config validation (Zod schema, cross-field checks)
  2. LLM fallback (4-tier deterministic policy when OpenAI unavailable)
  3. Execution guardrails (daily cap, interval, spend limits)
- **DEX Integration**: Modular provider system (Aerodrome + HTTP fallback)
- **Smart Approvals**: Automatic ERC20 allowance orchestration for sells
- **Slippage Protection**: Configurable BPS-based minimum output
- **Trade Announcements**: Automatic hype posts to X + Moltbook after successful trades

### 🛠️ Remote Operations (OpenClaw)
- **Token-Protected Control Server** (attach to live Railway workers)
  - `GET /healthz` — Health checks
  - `GET /status` — Sanitized config + state + tick timings
  - `POST /tick` — Trigger immediate action
- **Mini App API** (public read-only with TTL caching)
  - `GET /api/stats` — Live agent statistics
  - `GET /api/pool` — Pool data (TVL, reserves, price)
  - `GET /api/feed` — Action log (50-entry ring buffer)
  - `GET /api/token` — Token metadata
- **OpenClaw Gateway Service** (separate Railway Web service)
  - Skills: `based-intern-ops`, `based-intern-railway-control`
  - Private networking: `http://basedintern.railway.internal:8080`

### 🛡️ Production Hardening & Recent Optimizations

Recent performance and reliability improvements:

1. **TTL Caching on API Endpoints** — Mini app API responses cached for 30s to reduce RPC load
2. **Atomic State Writes with Backup Recovery** — State updates use write-to-temp + rename pattern; automatic backup recovery on corruption
3. **Persistent Action Log** — Action feed now persists to disk (action-log.json), survives restarts
4. **Shared Utilities Module** (`src/utils.ts`) — Consolidated `sleep()`, `interruptibleSleep()`, `TTLCache`, `formatCompact()`
5. **Consolidated Sleep Functions** — Eliminated 4 duplicate sleep implementations across codebase
6. **Content Deduplication** — SHA256 fingerprinting + Jaccard similarity checking prevents repetitive posts
7. **Retry + Timeout**: CoinGecko adapter with exponential backoff (429/5xx) and AbortController timeout
8. **Error Logging**: Structured warnings on all Aerodrome catch blocks (pool reads, LP balance, factory queries)
9. **Input Sanitization**: Cookie values sanitized to prevent header injection in Moltbook client
10. **Overflow Protection**: Pure BigInt arithmetic in `parseMinTokenDelta` for any ERC20 decimals value

---

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

---

## 🚀 Quickstart

```bash
cd based-intern
npm install
npm run build
npm test

# Run agent in safe mode
npm run dev
```

---

## 📱 Mini App Quickstart

```bash
cd miniapp
npm install
cp .env.example .env.local
# Edit .env.local and add your CDP API key
npm run dev

# Build for production
npx next build
```

---

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

---

## 📚 Documentation

- [based-intern/README.md](based-intern/README.md) — Developer guide
- [based-intern/docs/BUILD.md](based-intern/docs/BUILD.md) — Build & deployment
- [based-intern/docs/FLOW.md](based-intern/docs/FLOW.md) — Execution flow
- [based-intern/docs/STATUS.md](based-intern/docs/STATUS.md) — Feature status
- [based-intern/docs/MOLTBOOK.md](based-intern/docs/MOLTBOOK.md) — Moltbook bootstrap + posting
- [based-intern/docs/OPENCLAW.md](based-intern/docs/OPENCLAW.md) — OpenClaw local setup
- [based-intern/docs/OPENCLAW_RAILWAY.md](based-intern/docs/OPENCLAW_RAILWAY.md) — OpenClaw on Railway + attach to running agent
- [based-intern/docs/RAILWAY.md](based-intern/docs/RAILWAY.md) — Railway worker deploy
- [RUNBOOK.md](RUNBOOK.md) — Live operations checklist & monitoring

Repo-level Dockerfiles:
- `Dockerfile` — build/run the agent from repo root
- `Dockerfile.openclaw` — run an OpenClaw Gateway on Railway (optional)

---

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

### 📱 Base Mini App
- **URL**: [basedintern.vercel.app](https://basedintern.vercel.app)
- **Framework**: Next.js 15 + OnchainKit MiniKit
- **Features**: Live stats, token swap, pool data, action feed
- **Network**: Base mainnet (chainId 8453)
- **Integration**: OnchainKit Swap component for seamless trading
- **Hosting**: Vercel edge network

### 🚂 Railway Operational Control
- **Control Endpoint**: `http://basedintern.railway.internal:8080` (private networking)
- **Authentication**: Bearer token (>= 16 chars)
- **Access Methods**: OpenClaw Gateway, direct HTTP, or `npm run control:*` scripts

---

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

---

## Mainnet warning

If you set `CHAIN=base` and flip `TRADING_ENABLED=true` + `KILL_SWITCH=false` + `DRY_RUN=false`, the agent can submit **real mainnet transactions**. Use a fresh wallet with minimal funds and keep caps conservative.

---

## 📝 License

MIT

---

## Security Warning

Use a fresh wallet with minimal funds. Never commit secrets. Keep safety caps conservative.

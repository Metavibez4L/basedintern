# Based Intern - Implementation Status

## 🚀 Overview

**Based Intern** is a production-ready autonomous agent with unique capabilities:

- 🔐 **On-Chain Identity (ERC-8004)**: Live Base mainnet deployment with verifiable agentId + wallet binding
- 📡 **Multi-Platform Social**: X API + Moltbook with circuit breakers and rate-limit handling
- 🛠️ **Remote Operations**: OpenClaw Gateway + token-protected control server for Railway
- 💱 **Autonomous Trading**: Triple-safety architecture with modular DEX provider system
- ✅ **197 Deterministic Tests**: Comprehensive coverage with zero flaky tests

This document tracks the current implementation status of all features.

---

## ✅ Fully Implemented

### Token Contract
- [x] `BasedInternToken.sol` - Simple ERC20 with fixed supply
- [x] No mint after constructor
- [x] No taxes/fees
- [x] No blacklist functionality
- [x] No pausable functionality
- [x] OpenZeppelin ERC20 base
- [x] 1,000,000,000 token supply minted to deployer

### Hardhat Infrastructure
- [x] `hardhat.config.ts` - Base Sepolia (84532) and Base (8453) networks
- [x] `deploy-token.ts` - Deployment script with console output
- [x] Deployment JSON persistence (`deployments/<network>.json`)
- [x] BaseScan verification support (set `BASESCAN_API_KEY`, run `npx hardhat verify`)
- [x] TypeScript Hardhat setup
- [x] Compilation working (`npm run build:contracts`)
- [x] Hardhat tests included (`npx hardhat test`)

### ERC-8004 Agent Identity (Optional)
- [x] `contracts/erc8004/ERC8004IdentityRegistry.sol` - On-chain registry for agentId → agentURI + wallet binding
- [x] Deploy script (`npm run deploy:erc8004`)
- [x] Agent registration script (`npm run register:agent`)
- [x] Wallet binding script (`npm run set:agent-wallet`) using EIP-712 signatures
- [x] Receipt integration (optional `Agent:` line when ERC-8004 is enabled)
- [x] Profile-first template JSON (`docs/agent.profile.json`)
- [x] Strict/minimal template JSON (`docs/agent.registration.json`)

Known Base mainnet (8453) deployment:
- Identity Registry: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
- Agent: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
- agentURI (pinned): `https://raw.githubusercontent.com/Metavibez4L/basedintern/9a03a383107440d7c6ce360fe2efdce8b151ac40/based-intern/docs/agent.profile.json`

NOTE: This is a **LIVE Base mainnet (chainId 8453)** deployment.

### Agent Runtime Core
- [x] `src/index.ts` - Main tick loop
- [x] `src/config.ts` - Zod-validated environment config
- [x] `src/logger.ts` - Structured JSON logging
- [x] Token address resolution (env or deployments JSON)
- [x] Loop timing (configurable via LOOP_MINUTES)
- [x] Graceful error handling (continues on tick failures)

### Control Server (Remote Ops)
- [x] `src/control/server.ts` - Optional token-protected control plane for the running agent
  - [x] `GET /healthz` (no auth)
  - [x] `GET /status` (Bearer token) - returns sanitized config + state summary + tick timings
  - [x] `POST /tick?reason=...` (Bearer token) - requests an immediate tick; blocks concurrent ticks
- [x] Interruptible sleep so manual ticks can run immediately (no waiting for LOOP_MINUTES)

### State Management
- [x] `src/agent/state.ts` - Persistent state at `STATE_PATH` (default `data/state.json`)
- [x] Last trade timestamp tracking
- [x] Daily trade counter with automatic UTC midnight reset
- [x] State file creation on first run
- [x] Multi-instance support via per-process `STATE_PATH`
- [x] **X API circuit breaker state**
  - [x] Consecutive failure count (xApiFailureCount)
  - [x] Circuit breaker disabled-until timestamp (xApiCircuitBreakerDisabledUntilMs)
- [x] **Receipt idempotency state**
  - [x] Last posted receipt fingerprint (lastPostedReceiptFingerprint)
- [x] **Activity watcher state** (EVENT-DRIVEN RECEIPTS)
  - [x] Last seen nonce (lastSeenNonce)
  - [x] Last seen ETH balance (lastSeenEthWei)
  - [x] Last seen token balance (lastSeenTokenRaw)
  - [x] Last seen block number (lastSeenBlockNumber)
  - [x] Last post day UTC (lastPostDayUtc) - for optional daily heartbeat

### LangChain Integration
- [x] `src/agent/brain.ts` - LangChain tool-calling agent
- [x] `src/agent/prompt.ts` - Based Intern system prompt
- [x] `src/agent/tools.ts` - `get_context` tool for balance/settings
- [x] Tool-calling loop (up to 3 iterations)
- [x] JSON action/rationale parsing
- [x] Deterministic fallback when OPENAI_API_KEY missing
- [x] ChatOpenAI integration (gpt-4o-mini)

### Guardrails System
- [x] `src/agent/decision.ts` - Multi-layer safety checks
- [x] TRADING_ENABLED check (default: false)
- [x] KILL_SWITCH check (default: true)
- [x] DRY_RUN check (default: true)
- [x] Router configuration validation
- [x] Daily trade cap enforcement
- [x] Minimum interval between trades
- [x] Max spend per trade cap
- [x] Sell fraction cap (BPS-based)
- [x] Insufficient balance protection

### Receipt System (The Moat)
- [x] `src/agent/receipts.ts` - Standardized receipt formatting
- [x] Action, wallet, balances included
- [x] Price (or "unknown") included
- [x] TX hash (or "-" in DRY_RUN) included
- [x] Mode indicator (SIMULATED/LIVE)
- [x] 10 mood line variations (deterministic rotation)
- [x] Consistent multi-line format
- [x] **EVENT-DRIVEN POSTING** (NEW)
  - [x] `src/agent/watch.ts` - Activity detection module
  - [x] Detects wallet nonce increases (transactions occurred)
  - [x] Detects ETH balance deltas (>= MIN_ETH_DELTA, default 0.00001 ETH)
  - [x] Detects token balance deltas (>= MIN_TOKEN_DELTA, default 1000 tokens)
  - [x] Only posts when activity detected (eliminates timer spam)
  - [x] State persistence prevents duplicate posts on restart
  - [x] Detailed activity logging (shows reasons for post or skip)

### Chain Integration (viem)
- [x] `src/chain/client.ts` - Public + wallet client creation
- [x] `src/chain/chains.ts` - Base Sepolia + Base definitions
- [x] `src/chain/erc20.ts` - ETH balance, ERC20 decimals, ERC20 balance reads
  - [x] **ERC20 allowance/approval**
    - [x] `readAllowance()` - Check current spender allowance
    - [x] `approveToken()` - Send approve() transaction with configurable amount
    - [x] Smart approval orchestration (check → approve if insufficient → swap)
- [x] `src/chain/price.ts` - **Provider-driven price oracle** (NEW)
  - [x] DEX provider registry lookup
  - [x] Fallback to "unknown" when no provider available
- [x] `src/chain/aerodrome.ts` - Aerodrome DEX helpers
  - [x] Pool reading, reserve queries
  - [x] Constant product (x*y=k) output calculation
  - [x] Slippage application
  - [x] Router-compatible calldata encoding
- [x] **DEX Provider System** (NEW)
  - [x] `src/chain/dex/index.ts` - Provider registry and interface
  - [x] `src/chain/dex/aerodromeAdapter.ts` - Aerodrome adapter
    - [x] `getPrice()` - Read Aerodrome pool reserves and compute price
    - [x] `buildBuyCalldata()` - Generate WETH→INTERN swap calldata with quote
    - [x] `buildSellCalldata()` - Generate INTERN→WETH swap calldata with quote
- [x] `src/chain/trade.ts` - **Provider-driven trade execution** (NEW)
  - [x] Try provider-supplied calldata first (if available and configured)
  - [x] Fallthrough to legacy Aerodrome inline logic
  - [x] Automatic ERC20 approval orchestration for sells
- [x] Private key wallet support (WALLET_MODE=private_key)
- [x] CDP wallet mode (experimental, read-only fallback)
- [x] RPC URL configuration (per-chain or override)

### Social Posting
- [x] `src/social/poster.ts` - Social mode router
- [x] `src/social/x_api.ts` - **X API posting via OAuth 1.0a (recommended)**
  - [x] **Circuit breaker** - Disables posting after 3 consecutive failures for 30 minutes
    - Prevents hammering X API during outages
    - Automatically re-enables after cooldown expires
    - Failure count persisted in state.json
  - [x] **Idempotency / Deduplication** - Never posts the same receipt twice
    - Receipt fingerprint computed from text + 5-minute timestamp bucket
    - Persists lastPostedReceiptFingerprint in state.json
    - Skips duplicates without counting as failures
  - [x] **Rate-limit aware retries** - Respects X API rate limits
    - Detects HTTP 429 and rate-limit headers
    - Exponential backoff: 2min, 5min, 15min for rate-limited errors
    - Shorter backoff (1s, 3s, 8s) for transient errors
    - Respects rate-limit-reset headers
  - [x] SOCIAL_MODE=none (logs receipt only)

### Base News Brain (Optional)
- [x] `src/news/news.ts` - News plan builder (event/daily modes), cap enforcement, dedupe
- [x] `src/news/providers/` - Provider pipeline
  - [x] `defillama` (Base snapshot)
  - [x] `rss` (RSS/Atom)
  - [x] `github` (GitHub Atom feeds)
- [x] `src/news/score.ts` - Scoring + ranking with deterministic tie-breakers
- [x] `src/news/render.ts` - Deterministic fallback renderer (<= 240 chars) with occasional "NFA."
- [x] `src/social/news_poster.ts` - News posting via the same poster abstraction
- [x] Safety guardrails
  - [x] Requires a link when `NEWS_REQUIRE_LINK=true`
  - [x] Daily caps (`NEWS_MAX_POSTS_PER_DAY`) + interval caps (`NEWS_MIN_INTERVAL_MINUTES`)
  - [x] Feed validation: `NEWS_FEEDS` required for `rss`, `NEWS_GITHUB_FEEDS` required for `github`

### X Mentions Poller (Phase 1: Intent Recognition)
- [x] `src/social/x_mentions.ts` - **Comment → Intent recognition (NO TRADING)**
  - [x] **Command parsing**: help, status, buy, sell, why, unknown
    - Case-insensitive, partial matching, whitespace-tolerant
  - [x] **Safe replies** - Acknowledges intent but NEVER executes trades
    - Always explains guardrail status (TRADING_ENABLED, KILL_SWITCH, DRY_RUN)
    - Shows current mode (LIVE or DRY_RUN)
    - Personality-driven responses (consistent with Intern brand)
  - [x] **Mention polling** - Fetches mentions every X_POLL_MINUTES (default 2)
    - Uses X API v2 with OAuth 1.0a
    - Pagination via since_id to only fetch new mentions
  - [x] **Deduplication** - SHA256 fingerprint prevents duplicate replies
    - Tracks mentionId + command type
    - Maintains LRU list of 20 replied fingerprints
  - [x] **State persistence**
    - lastSeenMentionId (for pagination)
    - repliedMentionFingerprints (for dedup)
    - lastSuccessfulMentionPollMs (for poll interval)
  - [x] **Reply length enforcement** - Max 240 chars with "…" truncation

### TypeScript Build
- [x] ESM module configuration
- [x] `tsconfig.json` with NodeNext resolution
- [x] Compilation working (`npm run build`)
- [x] `tsx` runner for dev mode
- [x] Type-safe throughout

### Linting
- [x] `eslint.config.js` - TypeScript ESLint setup
- [x] Minimal rule set (no-unused-vars warning)
- [x] Ignore patterns for generated files

### Documentation
- [x] `README.md` - 3-step execution path
- [x] `.env.example` - All env vars with safe defaults
- [x] Security warnings section
- [x] Troubleshooting guide (X posting)
- [x] `docs/FLOW.md` - Detailed execution flow
- [x] `docs/STATUS.md` - This file
- [x] `docs/OPENCLAW.md` - OpenClaw local setup
- [x] `docs/OPENCLAW_RAILWAY.md` - OpenClaw on Railway + attach to running agent
- [x] Railway OpenClaw skills
  - [x] `skills/based-intern-ops` - run repo workflows (test/build/typecheck)
  - [x] `skills/based-intern-railway-control` - attach to live worker via control server

### Git Setup
- [x] `.gitignore` - Excludes node_modules, .env, generated files
- [x] Deployments JSON tracked (`deployments/*.json`) so networks/addresses are preserved
- [x] State JSON excluded (default: `data/state.json`)
- [x] Hardhat artifacts excluded
- [x] Published to GitHub: `github.com/Metavibez4L/basedintern`

### Configuration Validation (NEW)
- [x] `src/config.ts` - Comprehensive startup validation
  - [x] `validateGuardrails()` function checks:
    - MAX_SPEND_ETH_PER_TRADE is valid decimal and > 0 when trading
    - TRADING_ENABLED requires KILL_SWITCH=false, ROUTER_ADDRESS, WETH_ADDRESS
    - ROUTER_TYPE not 'unknown' when trading enabled
    - DAILY_TRADE_CAP > 0 when trading enabled
    - POOL_ADDRESS required when ROUTER_TYPE=aerodrome
    - X_COOKIES_PATH or X_COOKIES_B64 required when SOCIAL_MODE=playwright
  - [x] Fail-fast at startup with clear error messages
  - [x] All validation before any RPC calls
  - [x] 12 unit tests covering all validation paths

### Enhanced Deterministic Fallback (NEW)
- [x] `src/agent/brain.ts` - Upgraded fallback policy with 4 tiers
  - [x] Tier 1: No INTERN balance → BUY (establish position)
  - [x] Tier 2: Low ETH (<0.001) → SELL (rebalance)
  - [x] Tier 3: Price available → BUY if <$0.50, SELL if >$2.00
  - [x] Tier 4: No signal → Probabilistic decision (68% HOLD, 16% BUY, 16% SELL)
    - Uses deterministic hash of wallet address (no external randomness)
  - [x] All tiers check TRADING_ENABLED, KILL_SWITCH, DRY_RUN for safety
  - [x] 11 unit tests covering all fallback paths

### State Persistence with Schema Versioning (NEW)
- [x] `src/agent/state.ts` - Migration infrastructure
  - [x] STATE_SCHEMA_VERSION = 4
  - [x] `migrateState()` function for safe evolution
  - [x] v1 → v2: Added lastSeenBlockNumber field
  - [x] v2 → v3: Added Base News Brain fields (caps + dedupe + idempotency)
  - [x] v3 → v4: Added Moltbook posting fields (idempotency + circuit breaker)
  - [x] Backward compatible: old state files auto-upgraded
  - [x] Ready for future migrations (v5, v6, etc.)
  - [x] Logs migration events for debugging
  - [x] 8 unit tests covering migration and field preservation

### Moltbook Integration (Skill-spec Driven)
- [x] Skill spec fetch + cached mapping (`scripts/fetch-moltbook-skill.ts`, `data/moltbook/skill.json`)
- [x] Redirect-safe canonical host enforcement (`www.moltbook.com`) to avoid auth header stripping
- [x] Auth persistence (session.json) with redaction
- [x] CLI bootstrap commands (`register`, `status`, `doctor`, `claim`)
- [x] Receipt posting adapter with DRY_RUN, idempotency, min-interval, circuit breaker

### Social Posting (Fanout)
- [x] `SOCIAL_MODE=multi` + `SOCIAL_MULTI_TARGETS` for posting to multiple backends (e.g. X API + Moltbook)

## ✅ Live Identity Snapshot

- ERC-8004 (Base mainnet 8453)
  - Identity Registry: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
  - Agent ref: `eip155:8453:0xe280e13FB24A26c81e672dB5f7976F8364bd1482#1`
- Moltbook
  - Agent name: `BasedIntern_wi5rcx`

### HTTP Price Fallback Adapter (NEW)
- [x] `src/chain/dex/httpAdapter.ts` - CoinGecko free API fallback
  - [x] `getPrice()` uses CoinGecko API for Base mainnet contracts
  - [x] Returns null if Aerodrome pool is configured (preserves priority)
  - [x] Graceful error handling for network issues
  - [x] Rate limit aware (CoinGecko free tier friendly)
  - [x] Auto-registered via provider registry

---

## 🧪 Implemented (Needs Onchain Verification)

### Aerodrome Integration
- [x] `src/chain/aerodrome.ts` - Aerodrome DEX helpers (implemented; validate on Base Sepolia before mainnet)
  - [x] `readAerodromePool()` - Reads pool reserves from Aerodrome pairs
  - [x] `calculateAerodromeOutput()` - Computes swap output using constant product formula
  - [x] Stable vs volatile pool flag (stable path is a simplified approximation; not full stableswap math)
  - [x] Slippage protection (via `applySlippage()`)
  - [x] **buildAerodromeSwapCalldata()** - swapExactTokensForTokens() calldata builder (manual encoding)
    - Encodes Route[] struct with from/to/stable/factory fields
    - Encodes function selector and all parameters
    - Calculates deadline automatically
  - [x] `queryAerodromePool()` - Factory query for pool discovery

### Trading Execution
- [x] `src/chain/trade.ts` - Aerodrome trading implementation (implemented; validate on Base Sepolia before mainnet)
  - [x] Router type validation (ROUTER_TYPE must be "aerodrome")
  - [x] Pool reading and quote generation
  - [x] Slippage calculation
  - [x] Error handling and logging
  - [x] **executeBuy()** - Full BUY swap execution
    - Reads pool reserves
    - Calculates expected INTERN output
    - Builds swap calldata
    - Sends transaction with ETH value
    - Returns transaction hash
  - [x] **executeSell()** - Full SELL swap execution with ERC20 approval (NEW)
    - **Approval orchestration** (NEW)
      - Checks current INTERN allowance to router
      - If insufficient: sends approve() transaction
      - Handles fresh wallets with 0 allowance (no transaction needed)
    - Reads pool reserves
    - Calculates expected ETH output
    - Builds swap calldata
    - Sends transaction
    - Returns transaction hash

**Aerodrome Configuration**:
```bash
ROUTER_TYPE="aerodrome"
ROUTER_ADDRESS="0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"  # Aerodrome Router
POOL_ADDRESS="0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc"   # WETH/INTERN volatile pool (example)
WETH_ADDRESS="0x4200000000000000000000000000000000000006"    # Base WETH
AERODROME_STABLE="false"                                     # volatile pair (0.3% fee)
```

### Price Oracle
- [x] `src/chain/price.ts` - Aerodrome-powered price oracle
  - [x] Reads from Aerodrome pools when configured
  - [x] Calculates price: 1 INTERN = X ETH
  - [x] Graceful fallback to "unknown" if pool unavailable
  - [x] Multiple failure modes with detailed source reporting

**Price Oracle Flow**:
- If `ROUTER_TYPE=aerodrome` and `POOL_ADDRESS` set: attempts pool read
- Returns price in format: `$0.005234 ETH`
- Falls back to `null` (displayed as "unknown" in receipts) on any error
- Source indicates: `aerodrome`, `aerodrome_unavailable`, `aerodrome_mismatch`, `aerodrome_empty`, or `aerodrome_error`

### X API Posting
- [x] Implemented in `src/social/x_api.ts`

---

## 🎯 Verified Working

### End-to-End Flows

#### Token Deployment
```bash
npm install                           # ✅ Works
npm run build:contracts               # ✅ Compiles cleanly
npm run deploy:token -- --network hardhat  # ✅ Deploys + writes JSON
```

#### Base deployments
- Base Sepolia (84532)
  - INTERN: `0x23926b2CA264e1CD1Fc641E1C5C6e9f2066c91c1`
  - deployer: `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`
  - deployedAt: `2026-01-29T01:27:29.598Z`
- Base mainnet (8453) — **LIVE** (verified)
  - INTERN: `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11`
  - deployer: `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`
  - deployTx: `0xd41e966bddc10c6b373f71b952809efb86709de7aa3da835cc0aa7967e8a1e66`
  - deployedAt: `2026-01-30T03:25:50.255Z`
  - BaseScan: `https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11#code`

Operator warning: if you set `CHAIN=base` and flip `TRADING_ENABLED=true` + `KILL_SWITCH=false` + `DRY_RUN=false`, the agent can submit real mainnet transactions.

#### Agent Startup (DRY_RUN)
```bash
# With minimal env (CDP mode, example RPC)
WALLET_MODE=cdp CHAIN=base-sepolia \
BASE_SEPOLIA_RPC_URL=https://example.com \
BASE_RPC_URL=https://example.com \
SOCIAL_MODE=none DRY_RUN=true \
npm run dev
# ✅ Starts, logs receipt, stays running
```

#### TypeScript Compilation
```bash
npm run build                         # ✅ Compiles all TS sources cleanly
```

---

## 📋 Environment Variables Status

| Variable | Status | Default | Notes |
|----------|--------|---------|-------|
| `WALLET_MODE` | ✅ | `private_key` | CDP mode scaffolded |
| `PRIVATE_KEY` | ✅ | (none) | Required for private_key mode |
| `CHAIN` | ✅ | `base-sepolia` | base-sepolia or base |
| `BASE_SEPOLIA_RPC_URL` | ✅ | (required) | Must be set |
| `BASE_RPC_URL` | ✅ | (required) | Must be set |
| `RPC_URL` | ✅ | (none) | Optional override |
| `TOKEN_ADDRESS` | ✅ | (none) | Auto-resolved from deployments JSON |
| `LOOP_MINUTES` | ✅ | `30` | Tick interval |
| `DRY_RUN` | ✅ | `true` | Safe default |
| `TRADING_ENABLED` | ✅ | `false` | Safe default |
| `KILL_SWITCH` | ✅ | `true` | Safe default |
| `CONTROL_ENABLED` | ✅ | `false` | Enable control server (remote ops) |
| `CONTROL_BIND` | ✅ | `0.0.0.0` | Bind address for control server |
| `CONTROL_PORT` | ✅ | `8080` | Port for control server |
| `CONTROL_TOKEN` | ✅ | (none) | Required when CONTROL_ENABLED=true (>= 16 chars) |
| `DAILY_TRADE_CAP` | ✅ | `2` | Enforced by guardrails |
| `MIN_INTERVAL_MINUTES` | ✅ | `60` | Enforced by guardrails |
| `MAX_SPEND_ETH_PER_TRADE` | ✅ | `0.0005` | Enforced by guardrails |
| `SELL_FRACTION_BPS` | ✅ | `500` | 5% of holdings |
| `SLIPPAGE_BPS` | ✅ | `300` | 3% slippage |
| `ROUTER_TYPE` | ✅ | `unknown` | Must be set (e.g. `aerodrome`) before live trading |
| `ROUTER_ADDRESS` | ✅ | (none) | Required for live trading |
| `POOL_ADDRESS` | ✅ | (none) | INTERN/WETH pool address (e.g., Aerodrome) |
| `WETH_ADDRESS` | ✅ | (none) | Required for live trading (Base WETH is `0x4200…0006`) |
| `AERODROME_STABLE` | ✅ | `false` | Stable=true or volatile=false pool type |
| `AERODROME_GAUGE_ADDRESS` | ⚪ | (none) | Optional; Aerodrome gauge for yield farming |
| `SOCIAL_MODE` | ✅ | `none` | none/x_api/playwright |
| `X_API_KEY` | ✅ | (none) | OAuth 1.0a consumer key (X API recommended) |
| `X_API_SECRET` | ✅ | (none) | OAuth 1.0a consumer secret (X API recommended) |
| `X_ACCESS_TOKEN` | ✅ | (none) | OAuth 1.0a user access token (X API recommended) |
| `X_ACCESS_SECRET` | ✅ | (none) | OAuth 1.0a user access secret (X API recommended) |
| `X_PHASE1_MENTIONS` | ✅ | `false` | Enable Phase 1 mentions poller (intent recognition only) |
| `X_POLL_MINUTES` | ✅ | `2` | Poll mentions interval in minutes |
| `OPENAI_API_KEY` | ✅ | (none) | LangChain works when set |
| `NEWS_ENABLED` | ✅ | `false` | Enable Base News Brain |
| `NEWS_MODE` | ✅ | `event` | event/daily |
| `NEWS_SOURCES` | ✅ | `defillama,github,rss` | CSV list; legacy HTML sources also supported |
| `NEWS_MIN_SCORE` | ✅ | `0.5` | 0..1 threshold for ranked candidates |
| `NEWS_FEEDS` | ✅ | (empty) | Required when `NEWS_SOURCES` includes `rss` |
| `NEWS_GITHUB_FEEDS` | ✅ | (empty) | Required when `NEWS_SOURCES` includes `github` |
| `NEWS_MAX_POSTS_PER_DAY` | ✅ | `2` | Daily cap |
| `NEWS_MIN_INTERVAL_MINUTES` | ✅ | `120` | Minimum minutes between news posts |
| `NEWS_REQUIRE_LINK` | ✅ | `true` | Hard safety: skip if post missing URL |
| `NEWS_REQUIRE_SOURCE_WHITELIST` | ✅ | `true` | Enforce allowed source IDs |
| `CDP_API_KEY_NAME` | 🚧 | (none) | CDP experimental |
| `CDP_API_KEY_PRIVATE_KEY` | 🚧 | (none) | CDP experimental |

---

## 🔒 Security Features Status

- [x] Default safe mode (DRY_RUN=true, TRADING_ENABLED=false, KILL_SWITCH=true)
- [x] Multiple independent safety checks
- [x] Daily trade cap enforcement
- [x] Minimum interval enforcement
- [x] Max spend cap per trade
- [x] No secrets in git (`.env` gitignored)
- [x] Fresh wallet recommended in docs
- [x] Router config required for any trading

---

## 📊 Test Coverage

| Area | Tests | Status | Location |
|------|-------|--------|----------|
| Config validation | 12 | ✅ | tests/config.test.ts |
| Brain fallback policy | 11 | ✅ | tests/brain.test.ts |
| DEX provider system | 6 | ✅ | tests/dex.test.ts |
| Guardrails (decision.ts) | 18 | ✅ | tests/decision.test.ts |
| Receipt formatting (receipts.ts) | 22 | ✅ | tests/receipts.test.ts |
| Activity detection (watch.ts) | 32 | ✅ | tests/watch.test.ts |
| State persistence & migrations | 30 | ✅ | tests/state.test.ts + tests/state-persistence.test.ts |
| X Mentions (x_mentions.ts) | 37 | ✅ | tests/x_mentions.test.ts |
| **Total (Vitest)** | **196** | **✅ ALL PASS** | **tests/** |

**Test Framework**: Vitest v1.6+ (dev dependency)

**Running Tests**:
```bash
npm run test           # Run all Vitest tests once (~<1s)
npm run test:watch    # Watch mode (auto-rerun on changes)
npm run typecheck      # Project-based TS typecheck (no emit)

# Contract tests
npx hardhat test
```

**Key Features**:
- ✅ 100% deterministic (no network calls, all mocked)
- ✅ Zero external dependencies (vitest only)
- ✅ Full TypeScript type safety
- ✅ Covers all critical agent logic and fallback paths
- ✅ Includes error handling, edge cases, and integration scenarios

**Coverage by Feature**:
- **Config Validation**: All guardrail combinations, trading setup, social mode, error messages
- **Brain & Fallback**: All 4 decision tiers, price signals, safety checks, probabilistic paths
- **DEX Provider**: Registry interface, Aerodrome adapter, HTTP fallback, null handling
- **Guardrails**: TRADING_ENABLED, KILL_SWITCH, DRY_RUN, daily cap, intervals, spend limits
- **Receipts**: Multi-line format, mode indicator, balance formatting, mood rotation
- **Activity Detection**: Nonce, ETH delta, token delta, state patching, RPC errors
- **State Persistence**: Field preservation, migrations, UTC resets, daily counter resets
- **Mentions**: Command parsing, intent recognition, safe replies, deduplication, truncation

See [tests/README.md](../tests/README.md) for comprehensive test documentation.

---

## 🚀 Next Steps for Production

### Completed (✅ All Done)
1. ✅ **Modular DEX system** - `src/chain/dex/` with Aerodrome + HTTP adapters
   - Pool-agnostic price discovery with fallback support
   - Ready for custom DEX adapter additions

2. ✅ **Config validation** - Startup checks prevent invalid trading setups
   - All environment variables validated at startup
   - Clear, actionable error messages
   - 12 unit tests

3. ✅ **Enhanced fallback policy** - 4-tier decision making without OpenAI
   - Tier 1: Establish position (no INTERN)
   - Tier 2: Rebalance (low ETH)
   - Tier 3: Price signals (threshold-based)
   - Tier 4: Probabilistic (no signal)

4. ✅ **State schema versioning** - Safe evolution of state format
  - v1 → v3 migrations tested
   - Ready for future schema changes
   - 8 unit tests

5. ✅ **HTTP price fallback** - CoinGecko API for when Aerodrome pool unavailable
   - Auto-registered provider
   - Graceful error handling

### Critical (Must Do for Trading)
1. **Test with real RPC + wallet on Base Sepolia**
   - Deploy token with `npm run deploy:token -- --network baseSepolia`
   - Configure Aerodrome: set `POOL_ADDRESS`, `WETH_ADDRESS`, `ROUTER_ADDRESS`
   - Run agent for 1-2 hours in DRY_RUN mode
   - Verify receipts show correct prices and activities
   - Monitor logs for any errors

2. **Live trading setup checklist**
   - [ ] Agent running stably for 2+ hours in DRY_RUN
   - [ ] Receipts posting correctly to X
   - [ ] Price oracle returning values (not "unknown")
   - [ ] Activity detection working (nonce/balance changes detected)
   - [ ] Small initial trading cap (e.g., `MAX_SPEND_ETH_PER_TRADE=0.0001`)
   - [ ] Daily cap small (e.g., `DAILY_TRADE_CAP=1`)
   - [ ] Minimum interval set (e.g., `MIN_INTERVAL_MINUTES=120`)
   - [ ] TRADING_ENABLED=true, KILL_SWITCH=false only AFTER verification

### High Priority (Strengthen Agent)
1. **Simulation/backtest harness** - Test trading strategies before live
   - Replay historical price data
   - Test guardrail enforcement
   - Verify fallback policies

2. **Forked-chain integration tests** - Full E2E on Anvil
   - Deploy token locally
   - Test trading execution
   - Verify receipts

3. **CI/CD pipeline** - Automated tests on every push
  - Run Vitest unit tests (currently 196)
   - Type check
   - Lint

4. **Security audit**
   - Key safety and management
   - RPC endpoint security
   - X API credential handling
   - Contract audit

### Medium Priority (Nice to Have)
1. **Multi-route execution** - Try multiple DEX routes for best price
2. **Configurable risk profiles** - Conservative/moderate/aggressive trading modes
3. **Enhanced observability** - Metrics, dashboards, alerts
4. **Social posting controls** - Rate limiting, content filters
5. **Advanced monitoring** - Slack/Discord notifications, error alerts
   - Test live trading with tiny amounts

### Recommended (Should Do)
4. Test with real RPC + wallet on Base Sepolia
   - Deploy token
   - Configure Aerodrome (set POOL_ADDRESS, WETH_ADDRESS, etc.)
   - Run agent for 1-2 hours in DRY_RUN
   - Verify receipts show correct prices
   - Test live trading with tiny amounts

5. Add monitoring
   - Track tick duration
   - Alert on repeated failures
   - Log aggregation (Datadog, Sentry, etc.)

### Optional (Nice to Have)
7. Add CDP wallet support
   - Implement Coinbase Developer Platform integration
   - Test key management

8. Add more DEX support
   - Uniswap V3 (if operating on chains with V3 liquidity)
   - Velodrome v2 (Optimism/Polygon)
   - Curve (stablecoin trading)

9. Add price sources
   - Chainlink price feeds (if available on Base)
   - CoinGecko API fallback
   - Multiple oracle aggregation

---

## 🐛 Known Issues

1. **No Uniswap V3 support** yet
   - Currently Aerodrome only (Base-native DEX)
   - Plan to add V3 support for chains like Ethereum, Optimism, etc.

~~2. **Token approvals not yet implemented**~~ ✅ RESOLVED
   - ✅ Implemented transparent approval orchestration in `executeSell()`
   - ✅ Checks current allowance before attempting swap
   - ✅ Automatically approves router if needed
   - ✅ Handles fresh wallets with 0 allowance

---

## 📝 Changelog

### 2026-02-01
- ✅ OpenClaw + Railway remote ops workflow
  - ✅ Optional OpenClaw Gateway service (`Dockerfile.openclaw` at repo root)
  - ✅ Token-protected control server to attach to the running Railway worker
  - ✅ Scripts: `npm run control:health|control:status|control:tick`
  - ✅ Skills: `based-intern-ops`, `based-intern-railway-control`

### 2026-01-31
- ✅ ERC-8004 Identity Registry support (deploy/register/bind wallet) + optional receipt `Agent:` line
  - ✅ Base mainnet deploy: `0xe280e13FB24A26c81e672dB5f7976F8364bd1482`
  - ✅ Registered agentId: `1`
  - ✅ set-agent-wallet executed on mainnet
- ✅ Multi-instance support via `STATE_PATH` and script-level `DEPLOYMENTS_FILE`
- ✅ Hardhat contract tests added (`npx hardhat test`)

### 2026-01-30 (Phase 1 X Mentions Poller)
- ✅ **Phase 1: Comment → Intent recognition (NO TRADING)**
  - ✅ `src/social/x_mentions.ts` - Mention polling + safe replies
  - ✅ Command recognition: help, status, buy, sell, why, unknown
  - ✅ Safe replies that acknowledge intent but never execute trades
  - ✅ X API v2 mentions endpoint with OAuth 1.0a
  - ✅ Mention pagination (since_id) for efficient polling
  - ✅ Fingerprint-based deduplication (SHA256 mentionId + command)
  - ✅ LRU tracking of 20 recent replied mentions
  - ✅ Reply length enforcement (max 240 chars with "…")
  - ✅ State persistence: lastSeenMentionId, repliedMentionFingerprints, lastSuccessfulMentionPollMs
  - ✅ Configuration: X_PHASE1_MENTIONS (bool, default false), X_POLL_MINUTES (number, default 2)
  - ✅ Integration in main loop (runs before receipt posting, non-blocking)
  - ✅ **37 new comprehensive tests** (command parsing, reply composition, dedup, safety)
  - ✅ All guardrail explanations in replies (never mentions execution)
- ✅ **Test framework updated (at the time: 131 total tests, up from 94)**
  - ✅ 37 new tests for x_mentions (command parsing, composition, length, dedup, state)
  - ✅ All tests deterministic (no network calls, fully mocked)
  - ✅ Zero external dependencies added
  - ✅ Full TypeScript type safety
- ✅ Commands: `npm run test` (all pass), `npm run test:watch` (watch mode)
- ✅ Build command `npm run build` still passes (strict TypeScript)
- ✅ Commit: `346575a`

### 2026-01-30 (Comprehensive Test Suite)
- ✅ **Vitest test framework with 94 deterministic unit tests**
  - ✅ 18 tests for guardrails enforcement (decision.ts)
  - ✅ 22 tests for receipt formatting (receipts.ts)
  - ✅ 32 tests for activity detection (watch.ts)
  - ✅ 22 tests for state management (state.ts)
  - ✅ All tests deterministic (no network calls, fully mocked)
  - ✅ Zero external dependencies (vitest as dev dependency only)
  - ✅ Complete coverage of critical agent logic
  - ✅ Full TypeScript type safety with mocked viem clients
- ✅ Test documentation in [tests/README.md](../tests/README.md)
- ✅ Commands: `npm run test` (all pass), `npm run test:watch` (watch mode)
- ✅ Build command `npm run build` still passes (strict TypeScript)
- ✅ Commit: `e8ed82f`

### 2026-01-30 (ERC20 Allowance/Approval for SELL Trades)
- ✅ **ERC20 allowance checking and approval system implemented**
  - ✅ `readAllowance()` - Queries current router spending allowance
  - ✅ `approveToken()` - Sends ERC20 approve() transaction
  - ✅ `ensureAllowance()` - Smart orchestration (check → approve if needed → return metadata)
  - ✅ `executeSell()` - Now calls ensureAllowance() before swap execution
  - ✅ Handles fresh wallets with 0 allowance (no approval tx needed if amount is 0)
  - ✅ Handles insufficient allowance (sends approval, waits for confirmation)
  - ✅ Config options added:
    - `APPROVE_MAX` (bool, default false): Approve MaxUint256 vs exact amount
    - `APPROVE_CONFIRMATIONS` (number, default 1): Block confirmations to wait (future use)
- ✅ Updated `src/chain/erc20.ts` with new allowance/approval functions
- ✅ Updated `src/chain/trade.ts` to integrate approval into SELL flow
- ✅ Updated `src/config.ts` with approval configuration options
- ✅ TypeScript compilation passing (strict mode)
- ✅ No new dependencies added
- ✅ Commit: `61b37e8`

### 2026-01-30 (Event-Driven Receipt Posting)
- ✅ **Event-driven receipt posting implemented**
  - ✅ `src/agent/watch.ts` - Activity detection module
  - ✅ Detects wallet nonce increases (transactions occurred)
  - ✅ Detects ETH balance deltas (configurable MIN_ETH_DELTA, default 0.00001 ETH)
  - ✅ Detects token balance deltas (configurable MIN_TOKEN_DELTA, default 1000 tokens)
  - ✅ Only posts when activity detected (eliminates timer spam)
  - ✅ State persistence prevents duplicate posts on restart
  - ✅ Detailed activity logging (shows reasons for post or skip)
- ✅ Updated `src/agent/state.ts` with activity watcher fields:
  - lastSeenNonce, lastSeenEthWei, lastSeenTokenRaw, lastSeenBlockNumber, lastPostDayUtc
- ✅ Updated main loop in `src/index.ts` to call watcher before posting
- ✅ Conditional posting: only posts when activity.changed == true
- ✅ Always update watcher state (prevents restart spam)
- ✅ No new dependencies
- ✅ TypeScript compilation passing (strict mode)

### 2026-01-30 (X API Hardening)
- ✅ **X API posting hardened with production-grade resilience**
  - ✅ Circuit breaker pattern: 3 consecutive failures → 30-minute disable
  - ✅ Idempotency: Receipt fingerprinting prevents duplicate posts
  - ✅ Rate-limit handling: 429 detection + exponential backoff
  - ✅ Persistent state: Failure count, circuit breaker timer, last fingerprint
  - ✅ Structured logging: All behavior observable and debuggable
- ✅ Updated `src/agent/state.ts` with new persisted fields
- ✅ Updated `src/social/poster.ts` to pass state to X API poster
- ✅ Agent never crashes if X is down; continues normally
- ✅ TypeScript compilation passing with full type safety

### 2026-01-30 (Aerodrome Trading Execution)
- ✅ **Aerodrome trading execution complete**
  - ✅ `buildAerodromeSwapCalldata()` - Full ABI encoding of swapExactTokensForTokens()
  - ✅ `executeBuy()` - BUY swap with calldata building and transaction execution
  - ✅ `executeSell()` - SELL swap with calldata building and transaction execution
  - ✅ Route struct encoding with from/to/stable/factory fields
  - ✅ Proper deadline calculation (10-minute default)
  - ✅ Structured logging at each step (pool read, quote, calldata, submission)
- ✅ TypeScript compilation passing with full type safety
- ✅ Ready for testing on Base Sepolia

### 2026-01-30 (Earlier - Aerodrome Integration)
- ✅ **Aerodrome integration complete (partial)**
  - ✅ `src/chain/aerodrome.ts` - Pool reading, reserve queries, swap output calculation
  - ✅ `src/chain/price.ts` - Real-time price oracle using Aerodrome pools
  - ✅ Price fallback to "unknown" with detailed error sources
  - ✅ Support for stable and volatile pool types
  - ✅ Slippage protection implemented
- ✅ Config validation for Aerodrome params (POOL_ADDRESS, WETH_ADDRESS, etc.)
- ✅ Updated docs with Aerodrome integration guide
- ✅ Known deployment: WETH/INTERN pool on Base mainnet

### 2026-01-29
- ✅ Initial scaffold complete
- ✅ All core features implemented
- ✅ Token deployment working
- ✅ Agent runtime working
- ✅ LangChain integration working
- ✅ X API posting working
- ✅ Guardrails enforcing safety
- ✅ Published to GitHub
- ✅ TypeScript build fixed
- ✅ Documentation complete (FLOW.md, STATUS.md)

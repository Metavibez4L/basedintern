# Based Intern - Execution Flow

## Overview

Based Intern is a TypeScript agent that posts proof-of-life receipts and can execute capped trades on Base (Sepolia/mainnet). The system follows a strict 3-step execution path designed for safety and observability.

## Three-Step Execution Path

### Step 1: Deploy Token

**Purpose**: Deploy a simple ERC20 token with fixed supply and no special features.

**Flow**:
1. Compile Solidity contracts using Hardhat
2. Deploy `BasedInternToken` to Base Sepolia or Base mainnet
3. Save deployment info to `deployments/<network>.json`
4. (Optional) Verify contract on block explorer

**Key Safety Features**:
- Fixed supply: 1,000,000,000 tokens minted once to deployer
- No mint function after deployment
- No taxes, no blacklist, no pausable functionality
- Immutable after deployment

**Commands**:
```bash
npm run build:contracts
npm run deploy:token -- --network baseSepolia  # or --network base
```

**Verify (optional)**:
```bash
# set BASESCAN_API_KEY first
npx hardhat verify --network baseSepolia <TOKEN_ADDRESS>
npx hardhat verify --network base <TOKEN_ADDRESS>
```

### (Optional) ERC-8004: Register an on-chain agent identity

If you want receipts to include a portable identifier, register this agent in the ERC-8004 Identity Registry.

```bash
# Deploy the Identity Registry
npm run deploy:erc8004 -- --network baseSepolia

# Mainnet:
# npm run deploy:erc8004 -- --network base

# Register an agentId + agentURI
ERC8004_AGENT_URI="ipfs://<cid>" npm run register:agent -- --network baseSepolia

# Mainnet example (domain not required):
# ERC8004_AGENT_URI="https://raw.githubusercontent.com/Metavibez4L/basedintern/<commit>/based-intern/docs/agent.profile.json" npm run register:agent -- --network base

# Bind the agentId to the current wallet (EIP-712 signature)
npm run set:agent-wallet -- --network baseSepolia

# Mainnet:
# ERC8004_NEW_WALLET="0x..." npm run set:agent-wallet -- --network base
```

Notes:
- Scripts persist to `deployments/<network>.json` by default; set `DEPLOYMENTS_FILE` to override.
- To include the identifier in receipts, set `ERC8004_ENABLED=true` plus `ERC8004_IDENTITY_REGISTRY` and `ERC8004_AGENT_ID`.
- If `ERC8004_NEW_WALLET` equals the deployer wallet running the script, the wallet-binding flow can auto-sign (no extra private key env var needed).
- If Hardhat errors with a chainId mismatch, your RPC URL is pointing at the wrong network (Base mainnet is 8453 / `0x2105`, Base Sepolia is 84532 / `0x14a34`).

---

### Step 2: Launch Agent (Posting Mode - Event-Driven)

**Purpose**: Start the agent in a stable, safe posting-only mode for 1-2 hours to verify reliability before any trading.

**Key Feature**: Posts ONLY when meaningful onchain activity is detected (no timer spam).

**Flow**:
1. Agent starts with default safe settings:
   - `DRY_RUN=true` (simulated mode)
   - `TRADING_ENABLED=false` (trading blocked)
   - `KILL_SWITCH=true` (additional safety)
   - `SOCIAL_MODE=x_api` (recommended: reliable X posting via OAuth)

2. Every tick (default: 30 minutes):
   ```
   ┌──────────────────────────────────────────┐
   │ 1. Load Config & State                   │
   └────────────────┬────────────────────────┘
                    │
   ┌────────────────▼────────────────────────┐
   │ 2. Resolve Token Address                │
   │    - From env (TOKEN_ADDRESS)           │
   │    - Or from deployments/<network>.json │
   └────────────────┬────────────────────────┘
                    │
   ┌────────────────▼────────────────────────┐
   │ 3. Read On-Chain Data                   │
   │    - Wallet nonce                       │
   │    - ETH balance                        │
   │    - INTERN balance                     │
   │    - Price (best-effort)                │
   └────────────────┬────────────────────────┘
                    │
   ┌────────────────▼────────────────────────┐
   │ 4. DETECT ACTIVITY (NEW)                │
   │    - Nonce changed?                     │
   │    - ETH balance delta >= MIN_ETH?      │
   │    - Token balance delta >= MIN_TOKEN?  │
   └────────────────┬────────────────────────┘
                    │
        ┌───────────▼──────────────┐
        │ Activity detected?        │
        └───┬─────────────────────┬─┘
            │ NO                  │ YES
            │                     │
            ▼                     ▼
        Update state          Propose Action
        & sleep               (continue below)
                              │
   ┌─────────────────────────▼────────────┐
   │ 5. Propose Action (Brain)            │
   │    - LangChain if OPENAI_API_KEY set │
   │    - Fallback: deterministic HOLD    │
   └─────────────────────────┬────────────┘
                             │
   ┌─────────────────────────▼────────────┐
   │ 6. Enforce Guardrails                │
   │    - TRADING_ENABLED check           │
   │    - KILL_SWITCH check               │
   │    - DRY_RUN check                   │
   │    - Daily cap check                 │
   │    - Min interval check              │
   │    - Router config check             │
   └─────────────────────────┬────────────┘
                             │
   ┌─────────────────────────▼────────────┐
   │ 7. Execute Trade (if allowed)        │
   │    In DRY_RUN: skip execution        │
   └─────────────────────────┬────────────┘
                             │
   ┌─────────────────────────▼────────────┐
   │ 8. Build Receipt                     │
   │    - Action (HOLD/BUY/SELL)          │
   │    - Balances, price, TX hash        │
   │    - Mode (SIMULATED/LIVE)           │
   │    - Mood note (persona)             │
   └─────────────────────────┬────────────┘
                             │
   ┌─────────────────────────▼────────────┐
   │ 9. Post Receipt (X API)              │
   │    - Circuit breaker (3 failures)    │
   │    - Idempotency (no duplicates)     │
   │    - Rate-limit aware (backoff)      │
   │    - Updates state on success        │
   └──────────────────────────────────────┘
   ```

**Activity Triggers** (posts ONLY if any detected):
1. **Nonce increased** → transaction(s) were executed
2. **ETH balance changed by ≥ MIN_ETH_DELTA** (default: 0.00001 ETH = 10 gwei)
3. **Token balance changed by ≥ MIN_TOKEN_DELTA** (default: 1000 tokens, respects decimals)

**No Activity Detected** → skips posting, updates state, sleeps until next tick (reduces spam)

**Key Safety Features**:
- All trading blocked by default
- Agent stays alive even if X posting fails
- Event-driven posting eliminates timer spam
- Receipts posted as SIMULATED (tx: "-") in DRY_RUN mode
- Operator can observe stable activity before enabling live trading

**Example Commands**:
```bash
# Event-driven posting with X API (recommended)
SOCIAL_MODE=x_api DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true \
  X_API_KEY="..." X_API_SECRET="..." X_ACCESS_TOKEN="..." X_ACCESS_SECRET="..." \
  npm run dev

# Custom thresholds (optional)
MIN_ETH_DELTA="0.001" MIN_TOKEN_DELTA="10000" SOCIAL_MODE=x_api ... npm run dev
```

---

## Brain Decision Logic

The agent's decision-making uses a two-path approach:

### Path 1: LangChain (If OPENAI_API_KEY Set)
```
┌─────────────────────────────────┐
│ LangChain GPT-4o-mini Agent     │
├─────────────────────────────────┤
│ System Prompt (Based Intern)    │
│ Tool: get_context() →           │
│   - Wallet address              │
│   - ETH balance, INTERN balance │
│   - Current price               │
│   - Trading status              │
└─────────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │ LLM Output   │
    │ {            │
    │  action:     │
    │    BUY|SELL  │
    │    |HOLD     │
    │  rationale   │
    │ }            │
    └──────────────┘
```

### Path 2: Deterministic Fallback (Always Available)
Used when `OPENAI_API_KEY` missing or LLM fails. Four-tier strategy:

```
┌─────────────────────────────────────┐
│ Tier 1: No INTERN Balance?          │
│ → Propose BUY (establish position)  │
└─────────────────────────────────────┘
           │
      NO   │ YES
           │
           ▼
┌─────────────────────────────────────┐
│ Tier 2: ETH Balance < 0.001?        │
│ → Propose SELL (rebalance)          │
└─────────────────────────────────────┘
           │
      NO   │ YES
           │
           ▼
┌─────────────────────────────────────┐
│ Tier 3: Price Available?            │
│ Price < $0.50 → BUY                 │
│ Price > $2.00 → SELL                │
│ Otherwise → Continue                │
└─────────────────────────────────────┘
           │
      NO   │ YES (neutral)
           │
           ▼
┌─────────────────────────────────────┐
│ Tier 4: Probabilistic               │
│ Wallet hash % 100:                  │
│ [0-16]    → BUY (16%)               │
│ [16-32]   → SELL (16%)              │
│ [32-100]  → HOLD (68%)              │
└─────────────────────────────────────┘
```

**Key Features**:
- Deterministic (no external randomness, wallet-address based)
- Price-aware (uses available price signals)
- Risk-aware (respects balance thresholds)
- Always makes reasonable decisions (conservative)

---
   │    - Check TRADING_ENABLED              │
   │    - Check KILL_SWITCH                  │
   │    - Check DRY_RUN                      │
   │    - Check daily cap                    │
   │    - Check min interval                 │
   │    - Check router config                │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 6. Execute Trade (if allowed)           │
   │    In DRY_RUN mode: SKIP               │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 7. Build Receipt                        │
   │    - Action: HOLD/BUY/SELL             │
   │    - Balances (ETH + INTERN)            │
   │    - Price (or "unknown")               │
   │    - TX hash (or "-" in DRY_RUN)       │
   │    - Mode: SIMULATED/LIVE               │
   │    - Mood note (Based Intern persona)   │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 8. Post Receipt                         │
   │    - SOCIAL_MODE=none: Log only        │
   │    - SOCIAL_MODE=playwright: Post to X │
   │    - SOCIAL_MODE=x_api: Post via X API │
   └─────────────────────────────────────────┘
   ```

3. Agent continues loop indefinitely
4. On any error, logs and continues to next tick

**Key Safety Features**:
- All trading blocked by default
- Agent stays alive even if posting fails
- Receipts posted as SIMULATED with tx: "-"
- Operator can observe 1-2 hours of stable receipts before enabling live mode

**Commands**:
```bash
# Safe posting-only mode (recommended first run)
SOCIAL_MODE=none DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true npm run dev

# With X API posting
SOCIAL_MODE=x_api DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true \
  X_API_KEY="..." X_API_SECRET="..." X_ACCESS_TOKEN="..." X_ACCESS_SECRET="..." \
  npm run dev
```

---

### Step 3: Enable Capped Trading (Aerodrome on Base)

**Purpose**: Carefully flip to live trading with strict safety caps and Aerodrome integration.

**Flow**:
1. Verify Step 2 ran successfully for 1-2 hours
2. Deploy INTERN token (or use existing deployment)
3. Set Aerodrome router configuration:
   - `ROUTER_TYPE=aerodrome`
   - `ROUTER_ADDRESS=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
   - `POOL_ADDRESS=<INTERN/WETH pool address>`
   - `WETH_ADDRESS=0x4200000000000000000000000000000000000006` (Base WETH)
   - `AERODROME_STABLE=false` (volatile pair)
4. Change environment variables:
   - `DRY_RUN=false` (allow real transactions)
   - `TRADING_ENABLED=true` (enable trading)
   - `KILL_SWITCH=false` (remove emergency brake)
   - Keep tiny safety caps:
     - `DAILY_TRADE_CAP=2` trades per day
     - `MAX_SPEND_ETH_PER_TRADE=0.0005` ETH max
     - `MIN_INTERVAL_MINUTES=60` minutes between trades
     - `SLIPPAGE_BPS=300` (3% max slippage)

5. Agent now executes real trades via Aerodrome:
   ```
   Same tick flow as Step 2, but:
   
   Step 3: Read On-Chain Data → Queries Aerodrome pool for reserves + price
   Step 4: Propose Action → LangChain considers price + action
   Step 5: Enforce Guardrails → Checks all caps + circuit breaker (if X API fails)
   Step 6: Execute Trade → Builds swap calldata, sends real transaction
   Step 8: Post Receipt → Includes actual tx hash and real price
   ```

**Key Safety Features (Aerodrome Trading)**:
- Pool read before every trade (real-time price discovery)
- Constant product formula (x*y=k) with slippage protection
 - Constant product formula (x*y=k) with slippage protection
 - Pluggable DEX registry: the agent now supports multiple DEX adapters (Aerodrome adapter registered by default). Price lookup and routing are provider-driven so removing a single test pool will not break price discovery if alternate providers are configured.
    - See `src/chain/dex` for the provider registry and adapters.
    - To add providers, implement the `DexProvider` shape and register on import.
- Swap calldata encoding with proper deadlines (10 minutes)
- Detailed logging at each step (pool read, quote, calldata, submission)
- Guardrails enforce caps BEFORE execution (not retriable)
   Step 7: Build Receipt → Includes real tx hash
   Step 8: Post Receipt → Posts as LIVE mode
   ```

5. Trade execution tracked in `STATE_PATH` (default `data/state.json`):
   - Last trade timestamp
   - Daily trade counter (resets at UTC midnight)

**Key Safety Features**:
- Multiple independent safety checks (TRADING_ENABLED, KILL_SWITCH, DRY_RUN, router config)
- Strict daily cap (default: 2 trades/day)
- Minimum interval between trades (default: 60 minutes)
- Max spend per trade capped (default: 0.0005 ETH)
- Sell fraction capped (default: 5% of holdings)
- Operator can flip KILL_SWITCH=true at any time to stop trading immediately

### Notes on removed/changed pools

- If you removed a test pool (POOL_ADDRESS), the agent will no longer be able to quote from that specific pool.
- **With the DEX provider system**, the agent now supports pluggable price oracles and trade routing:
  - Price lookup tries each registered provider in order until one succeeds or all fail (returns `price: unknown`)
  - Trade execution attempts provider-supplied calldata (if available), then falls back to the legacy Aerodrome logic
  - If a single pool is removed, you can add an alternate provider (TheGraph, on-chain factory query, HTTP price feed) without modifying the core agent

**Quick remediation**:
1. **Add an adapter** under `src/chain/dex` implementing the `DexProvider` interface:
   ```typescript
   export const MyAdapter = {
     name: "my-dex",
     getPrice: async (cfg, clients, token, weth) => { /* fetch price */ },
     buildBuyCalldata: async (cfg, clients, token, weth, wallet, spendEth) => { /* return calldata */ }
   };
   registerDexProvider(MyAdapter);
   ```
2. **Or**, set `POOL_ADDRESS` back to a working pool if you have an alternate Aerodrome pair
3. **Example**: The Aerodrome adapter at `src/chain/dex/aerodromeAdapter.ts` shows how to implement price reading and calldata builders.

**Commands**:
```bash
SOCIAL_MODE=x_api DRY_RUN=false TRADING_ENABLED=true KILL_SWITCH=false npm run dev
```

---

## Agent Brain (LangChain)

The agent uses LangChain for intelligent decision-making when `OPENAI_API_KEY` is set.

**Tool-Calling Flow**:
1. System prompt defines "Based Intern" persona (deadpan, compliance-friendly)
2. Agent calls `get_context` tool to retrieve current state
3. LLM proposes action: BUY, SELL, or HOLD with rationale
4. Guardrails enforce caps regardless of LLM output

**Fallback Policy** (no OPENAI_API_KEY):
- If trading disabled or DRY_RUN: propose HOLD
- If no INTERN balance: propose BUY (capped by guardrails)
- If have INTERN balance: propose SELL (capped by guardrails)

---

## Receipts (The Moat)

Every tick produces a standardized receipt:

```
BASED INTERN REPORT
ts: 2026-01-29T23:55:02Z
action: HOLD
wallet: 0x1234...5678
eth: 0.01
intern: 1000000
price: unknown
tx: -
mode: SIMULATED
note: Still unpaid. Still posting.
```

**Receipt Features**:
- Consistent format (easy to parse/verify)
- Includes all relevant state
- TX hash when live trade executed
- Mode indicator (SIMULATED vs LIVE)
- Mood line rotates daily (10 variations)
- Posted to X via X API (OAuth 1.0a) or logged

---

## Guardrails

All trading decisions pass through multiple independent safety checks:

```
                 ┌───────────────────┐
                 │ Proposed Action   │
                 │ (from Brain)      │
                 └─────────┬─────────┘
                           │
                ┌──────────▼──────────┐
                │ TRADING_ENABLED?    │
                │ (default: false)    │
                └──────────┬──────────┘
                    NO     │ YES
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ KILL_SWITCH?        │
                │ (default: true)     │
                └──────────┬──────────┘
                    YES    │ NO
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ DRY_RUN?            │
                │ (default: true)     │
                └──────────┬──────────┘
                    YES    │ NO
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ Router configured?  │
                └──────────┬──────────┘
                    NO     │ YES
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ Daily cap reached?  │
                └──────────┬──────────┘
                    YES    │ NO
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ Min interval met?   │
                └──────────┬──────────┘
                    NO     │ YES
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ Amount caps OK?     │
                └──────────┬──────────┘
                    NO     │ YES
              ┌────────────┘
              │
       ┌──────▼──────┐
       │ HOLD        │
       └─────────────┘
                           │
                ┌──────────▼──────────┐
                │ EXECUTE TRADE       │
                └─────────────────────┘
```

---

## State Persistence

Agent state is persisted in `STATE_PATH` (default `data/state.json`):

```json
{
  "lastExecutedTradeAtMs": 1738108800000,
  "dayKey": "2026-01-29",
  "tradesExecutedToday": 1
}
```

- Daily counter resets automatically at UTC midnight
- Prevents exceeding daily trade cap
- Enforces minimum interval between trades

For multiple concurrent agents, give each process its own `STATE_PATH`.

---

## Error Handling

The agent is designed to be resilient:

1. **RPC Failures**: Falls back to 0 balance, continues loop
2. **Price Oracle Failures**: Reports "unknown", continues loop
3. **Posting Failures**: Logs error, retries with backoff, continues loop
4. **Trade Execution Failures**: Logs error, posts HOLD receipt, continues loop
5. **Config Errors**: Fails fast on startup with clear message

The agent **never exits** unless explicitly stopped by operator or fatal config error on startup.

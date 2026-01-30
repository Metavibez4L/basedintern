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

---

### Step 2: Launch Agent (Posting Mode)

**Purpose**: Start the agent in a stable, safe posting-only mode for 1-2 hours to verify reliability before any trading.

**Flow**:
1. Agent starts with default safe settings:
   - `DRY_RUN=true` (simulated mode)
   - `TRADING_ENABLED=false` (trading blocked)
   - `KILL_SWITCH=true` (additional safety)
   - `SOCIAL_MODE=none` (logs only, no X posting)

2. Every tick (default: 30 minutes):
   ```
   ┌─────────────────────────────────────────┐
   │ 1. Load Config & State                  │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 2. Resolve Token Address                │
   │    - From env (TOKEN_ADDRESS)           │
   │    - Or from deployments/<network>.json │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 3. Read On-Chain Data                   │
   │    - ETH balance                        │
   │    - INTERN balance                     │
   │    - Price (best-effort, may be unknown)│
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 4. Propose Action (Brain)               │
   │    - If OPENAI_API_KEY: LangChain agent │
   │    - Else: Deterministic fallback       │
   └─────────────────┬───────────────────────┘
                     │
   ┌─────────────────▼───────────────────────┐
   │ 5. Enforce Guardrails                   │
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

# With Playwright X posting
SOCIAL_MODE=playwright DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true npm run dev
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
- Swap calldata encoding with proper deadlines (10 minutes)
- Detailed logging at each step (pool read, quote, calldata, submission)
- Guardrails enforce caps BEFORE execution (not retriable)
   Step 7: Build Receipt → Includes real tx hash
   Step 8: Post Receipt → Posts as LIVE mode
   ```

5. Trade execution tracked in `data/state.json`:
   - Last trade timestamp
   - Daily trade counter (resets at UTC midnight)

**Key Safety Features**:
- Multiple independent safety checks (TRADING_ENABLED, KILL_SWITCH, DRY_RUN, router config)
- Strict daily cap (default: 2 trades/day)
- Minimum interval between trades (default: 60 minutes)
- Max spend per trade capped (default: 0.0005 ETH)
- Sell fraction capped (default: 5% of holdings)
- Operator can flip KILL_SWITCH=true at any time to stop trading immediately

**Commands**:
```bash
SOCIAL_MODE=playwright DRY_RUN=false TRADING_ENABLED=true KILL_SWITCH=false npm run dev
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
- Posted to X via Playwright or logged

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

Agent state is persisted in `data/state.json`:

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

---

## Error Handling

The agent is designed to be resilient:

1. **RPC Failures**: Falls back to 0 balance, continues loop
2. **Price Oracle Failures**: Reports "unknown", continues loop
3. **Posting Failures**: Logs error, retries with backoff, continues loop
4. **Trade Execution Failures**: Logs error, posts HOLD receipt, continues loop
5. **Config Errors**: Fails fast on startup with clear message

The agent **never exits** unless explicitly stopped by operator or fatal config error on startup.

# Based Intern - AI Agent Coding Guidelines

## Project Overview

**Based Intern** is an autonomous TypeScript + Solidity agent that posts proof-of-life receipts and executes capped trades on Base L2 (Sepolia/mainnet). The codebase emphasizes **safety-first design** with multiple independent guardrails and deterministic fallbacks.

## Architecture & Data Flow

### Core Loop (30-minute ticks, configurable via `LOOP_MINUTES`)

```
Config → Chain Clients → Read State → Propose Action → Enforce Guardrails → Execute/Post
   ↓         ↓              ↓              ↓               ↓                    ↓
 Zod      viem       state.json      LangChain      Multi-check           Trade/Post
 valdtn   (viem)     LLM fallback     decision       then execute          to X/chain
```

**Key files**:
- [src/index.ts](src/index.ts) - Main loop entrypoint (`tick()` function)
- [src/config.ts](src/config.ts) - Zod schema validation; environment-driven config
- [src/agent/brain.ts](src/agent/brain.ts) - Dual-path proposal (LangChain vs deterministic)
- [src/agent/decision.ts](src/agent/decision.ts) - Guardrail enforcement before execution
- [src/chain/](src/chain/) - viem clients, price reads, trade execution

### Safety-First Design Principle

**Three independent safety layers** (all must pass for live trading):

1. **Config validation** (Zod in [config.ts](src/config.ts)): Catch invalid env at startup
2. **Proposal fallback** ([brain.ts](src/agent/brain.ts)): If LLM fails, use conservative deterministic policy
3. **Guardrail enforcement** ([decision.ts](src/agent/decision.ts)): Hard caps on daily trades, spend, intervals

**Critical flags** (AND logic—all must be true for trading):
- `TRADING_ENABLED=true` (defaults false)
- `KILL_SWITCH=false` (defaults true—blocks execution)
- `DRY_RUN=false` (defaults true—simulates only)
- `ROUTER_ADDRESS` must be configured (even if scaffolded for now)

See [enforceGuardrails()](src/agent/decision.ts) for exact cap logic.

## Directory Structure & Responsibilities

```
src/
├── index.ts              # Main loop; orchestrates ticking
├── config.ts             # Zod schema + RPC resolution
├── logger.ts             # Structured logging (no console.log)
├── agent/
│   ├── brain.ts          # Action proposal: LangChain (if API key) + fallback policy
│   ├── decision.ts       # Guardrail checks; approves/blocks actions
│   ├── prompt.ts         # System + tool descriptions for LLM
│   ├── receipts.ts       # Format receipt messages (proof-of-life)
│   ├── state.ts          # Persist trade history (state.json)
│   └── tools.ts          # LangChain tool definitions for agent
├── chain/
│   ├── chains.ts         # viem chain definitions (base, baseSepolia)
│   ├── client.ts         # Public + wallet client factory
│   ├── erc20.ts          # Read ETH/INTERN balances + decimals
│   ├── price.ts          # Best-effort price oracle (returns null if unavailable)
│   └── trade.ts          # DEX trade execution (scaffolded)
└── social/
    ├── poster.ts         # Factory for X poster (mode-agnostic)
    ├── x_api.ts          # Twitter API posting (v1.1 / v2)
    └── x_playwright.ts   # Playwright-based posting (cookie-authenticated)

contracts/
└── BasedInternToken.sol  # Simple ERC20: fixed supply, no minting post-deploy

deployments/              # Auto-generated per network
├── baseSepolia.json      # {token, deployer, deployedAt, ...}
└── base.json
```

## Key Patterns & Conventions

### 1. **Deterministic Fallback Over Errors**

**Pattern**: When external services (LLM, RPC, price oracle) fail, **continue running** with safe fallback logic.

**Examples**:
- [brain.ts](src/agent/brain.ts#L25): If LangChain fails, use `fallbackPolicy()` (always returns `HOLD`)
- [index.ts](src/index.ts#L60-L65): RPC read failure → log warn, continue loop
- [price.ts](src/chain/price.ts): No price available → return `null`, receipt shows "unknown"

**When implementing features**: Always provide a no-op or conservative default if external service fails.

### 2. **Config-Driven Behavior (Zod Validation)**

All runtime behavior controlled via `.env` → [config.ts](src/config.ts) Zod schema.

**Convention**:
- Add new env vars to `envSchemaBase` (base fields) or `envSchema.superRefine()` (cross-field validation)
- Use `.default()` for safe fallbacks (e.g., `DRY_RUN` defaults `true`)
- Use `.optional()` only for truly optional features (e.g., `OPENAI_API_KEY`)
- Validate at startup; fail fast if invalid

**Example** (from config.ts):
```typescript
DRY_RUN: BoolFromString.default("true"),  // Safe default
TRADING_ENABLED: BoolFromString.default("false"),  // Off by default
```

### 3. **Structured Logging (No console.log)**

**File**: [logger.ts](src/logger.ts)

**Pattern**: All logs use `logger.info()`, `logger.warn()`, `logger.error()` with structured context objects.

```typescript
logger.warn("operation name", { error: err.message, retries: 3 });
```

Avoid `console.log` anywhere; tests or quick debug should still use logger.

### 4. **State Persistence for Trade History**

**File**: [agent/state.ts](src/agent/state.ts)

Trades recorded in `data/state.json` to track:
- `tradesExecutedToday` (reset daily at UTC midnight)
- `lastExecutedTradeAtMs` (for minimum interval checks)

**Pattern**: Load state at tick start, record trade after execution. Atomic overwrites.

### 5. **Receipt as Proof-of-Life**

**File**: [agent/receipts.ts](src/agent/receipts.ts)

Every tick, regardless of action, builds a receipt with:
- Action (BUY/SELL/HOLD)
- Wallet address
- ETH & INTERN balances
- Current price (if available)
- Tx hash (if executed)
- Mode (DRY_RUN, SIMULATED, or LIVE)

**Why**: Receipt is the "moat"—proves agent is alive and under control.

### 6. **Dual Social Mode (Playwright vs API)**

**File**: [social/poster.ts](src/social/poster.ts) → [x_playwright.ts](src/social/x_playwright.ts) or [x_api.ts](src/social/x_api.ts)

```typescript
SOCIAL_MODE: "none" | "playwright" | "x_api"
```

- `none`: Log receipts locally only (default, safe)
- `playwright`: Browser automation with cookies (see [save-x-cookies.ts](scripts/save-x-cookies.ts))
- `x_api`: Twitter API v1.1/v2 (requires API keys)

**Convention**: Poster factory returns interface `{ post(text: string): Promise<void> }`. Implementations handle auth internally.

## Critical Developer Workflows

### Build & Deploy Token

```bash
cd based-intern
npm install
npm run build:contracts    # Compiles Solidity to artifacts/
npm run deploy:token -- --network baseSepolia  # or --network base
# Writes deployments/{baseSepolia|base}.json
```

**Note**: Deployment script auto-resolves in [index.ts](src/index.ts#L17) from deployments JSON if `TOKEN_ADDRESS` env not set.

### Run Agent Locally (Posting Mode)

```bash
cd based-intern
npm run dev    # Default: DRY_RUN=true, TRADING_ENABLED=false, SOCIAL_MODE=none
```

Safe mode for testing. Check [docs/FLOW.md](docs/FLOW.md) for 3-step execution path.

### Enable Trading (Scariest Workflow)

**Only after 1–2 hours of safe posting mode**:

1. Verify receipts posted correctly
2. Set: `TRADING_ENABLED=true`, `KILL_SWITCH=false`, `DRY_RUN=false`, `ROUTER_ADDRESS=<addr>`
3. Restart agent
4. Monitor first 3 trades closely
5. Revert any setting immediately if behavior unexpected

**See**: [docs/FLOW.md](docs/FLOW.md) **Step 3** for detailed trade execution flow.

### Lint & Type Check

```bash
npm run lint        # ESLint (see eslint.config.js)
npm run build       # TypeScript compile (see tsconfig.json)
```

## Integration Points & External Dependencies

| Service         | File(s)                        | Failure Mode                | Fallback                  |
|-----------------|--------------------------------|-----------------------------|-|
| **OpenAI/LLM**  | [brain.ts](src/agent/brain.ts) | Proposal fails              | `fallbackPolicy()` → HOLD |
| **RPC (viem)**  | [chain/client.ts](src/chain/client.ts) | Read fails             | Log warn, use last-known state |
| **Price Oracle (Aerodrome)** | [chain/price.ts](src/chain/price.ts) | Pool unavailable | Return `null`, receipt shows unknown |
| **Aerodrome DEX** | [chain/aerodrome.ts](src/chain/aerodrome.ts) | Swap fails | Transaction reverts; guardrails prevent retry |
| **X (Playwright)** | [x_playwright.ts](src/social/x_playwright.ts) | Post fails     | Log error, continue loop |
| **Hardhat**     | scripts, contracts             | Deploy fails               | Manual redeploy + update JSON |

## Aerodrome Integration

**Aerodrome** is the Base-native DEX. The agent supports Aerodrome for liquidity routing and price discovery.

### Configuration

Set these environment variables to enable Aerodrome trading:

```bash
ROUTER_TYPE="aerodrome"
ROUTER_ADDRESS="0xcF77a3Ba9A5CA922176B76f7201d8933374ff5Ac"  # Aerodrome Router (same on Base & Sepolia)
POOL_ADDRESS="0x..."                                          # INTERN/WETH pool address
WETH_ADDRESS="0x4200000000000000000000000000000000000006"    # Base WETH
AERODROME_STABLE="false"                                      # true = stable pair, false = volatile
```

### Key Files

- [src/chain/aerodrome.ts](src/chain/aerodrome.ts) - Pool queries, price calculations, swap routing
- [src/chain/price.ts](src/chain/price.ts) - Uses Aerodrome pools for price discovery
- [src/chain/trade.ts](src/chain/trade.ts) - BUY/SELL execution via Aerodrome router

### How It Works

1. **Pool Discovery**: Query Aerodrome factory for INTERN/WETH pool
2. **Reserve Reading**: Get pool reserves to calculate swap output
3. **Price Calculation**: `price = WETH_reserves / INTERN_reserves`
4. **Swap Quote**: Use constant product formula (x*y=k) to estimate output
5. **Slippage Protection**: Apply `SLIPPAGE_BPS` to minimum output amount
6. **Execution**: Send swap transaction via Aerodrome router

### Stable vs Volatile Pools

- **Volatile** (`AERODROME_STABLE=false`): Uses standard x*y=k formula (higher slippage for large trades)
- **Stable** (`AERODROME_STABLE=true`): Uses stableswap formula (lower slippage, best for pegged assets)

### TODO: Calldata Encoding

The actual swap execution requires encoding Aerodrome route structs and calling the router. This is partially implemented—see [buildAerodromeSwapCalldata()](src/chain/aerodrome.ts) for the pattern.

To complete:
1. Encode route array: `Route[] = [{ from: WETH, to: INTERN, stable: false, factory: 0x... }]`
2. Call router method: `swapExactTokensForTokens(amountIn, amountOutMin, routes, recipient, deadline)`
3. Send via `walletClient.sendTransaction()`

## Testing & Debugging

- **Unit tests**: Not yet present; use `npm run dev` with `DRY_RUN=true` for manual verification
- **Type safety**: All files use strict TypeScript (`tsconfig.json` includes strict flags)
- **Environment validation**: Zod schema catches config errors at startup—run with invalid `.env` to test
- **Receipts as audit trail**: All actions logged in receipt format; pipe to observability service if needed
- **Aerodrome queries**: Logs include pool info and swap quotes for debugging

## Common Extensions & TODOs

- **Trading Execution** ([chain/trade.ts](src/chain/trade.ts)): Aerodrome pool/quote logic done; needs calldata encoding for swaps
- **Price Oracle** ([chain/price.ts](src/chain/price.ts)): Aerodrome integration complete; ready for production
- **Agent Tools** ([agent/tools.ts](src/agent/tools.ts)): Expand tool definitions for LangChain if broader decision-making needed
- **State Migration**: If moving from `state.json` to DB, preserve UTC daily reset logic in [state.ts](src/agent/state.ts)
- **Aerodrome Calldata**: Finish swap calldata encoding in [aerodrome.ts](src/chain/aerodrome.ts)

## Glossary

- **Tick**: One iteration of the main loop (~30 min by default)
- **Guardrail**: Hard cap or safety check enforced before execution
- **Receipt**: Standardized proof-of-life message posted each tick
- **DRY_RUN**: Simulated mode; no real transactions
- **Fallback Policy**: Conservative default (always `HOLD`) if LLM unavailable
- **State**: `data/state.json` tracking daily trade count and last execution time
- **Aerodrome**: Base-native DEX with stable and volatile pools
- **Swap Route**: Path through pool to exchange WETH for INTERN (or vice versa)

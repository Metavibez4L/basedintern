# based-intern

Senior TS + Solidity scaffold for a “Based Intern” agent that can post proof-of-life receipts and (optionally) trade with strict safety caps.

## Current deployments

- **Base Sepolia (84532)**:
  - **INTERN**: `0x23926b2CA264e1CD1Fc641E1C5C6e9f2066c91c1`
  - **deployer**: `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`
  - **deployedAt**: `2026-01-29T01:27:29.598Z`
- **Base mainnet (8453)**:
  - **INTERN**: `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11`
  - **deployer**: `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`
  - **deployTx**: `0xd41e966bddc10c6b373f71b952809efb86709de7aa3da835cc0aa7967e8a1e66`
  - **deployedAt**: `2026-01-30T03:25:50.255Z`
  - **BaseScan (verified)**: `https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11#code`

## PATH (MUST FOLLOW)

### Step 1: Deploy token yourself (simple ERC20)

#### 1a) Install + configure env

```bash
cd based-intern
npm install
cp .env.example .env
```

Set in `.env`:
- `PRIVATE_KEY` (fresh wallet recommended)
- `BASE_SEPOLIA_RPC_URL` and/or `BASE_RPC_URL`
- `CHAIN="base-sepolia"` (default) or `CHAIN="base"`

#### 1) Compile contracts

```bash
npm run build:contracts
```

#### 2) Deploy token (writes deployments json)

Base Sepolia:

```bash
npm run deploy:token -- --network baseSepolia
```

Base mainnet:

```bash
npm run deploy:token -- --network base
```

This writes:
- `deployments/baseSepolia.json` (when `--network baseSepolia`)
- `deployments/base.json` (when `--network base`)

#### 1b) Verify token (optional)

Verification is optional. This repo supports BaseScan verification via Hardhat.

Set in `.env`:
- `BASESCAN_API_KEY=...` (create at `https://basescan.org/myapikey`)

Then:

```bash
# Base Sepolia
npx hardhat verify --network baseSepolia <TOKEN_ADDRESS>

# Base mainnet
npx hardhat verify --network base <TOKEN_ADDRESS>
```

---

### Step 2a: Run Tests (Recommended)

Before deploying or running live, verify the codebase with automated tests:

```bash
npm run test
```

**Output**:
```
 Test Files  5 passed (5)
      Tests  131 passed (131)
   Duration  ~571ms
```

**What's tested**:
- ✅ Guardrails enforcement (KILL_SWITCH, TRADING_ENABLED, caps, intervals)
- ✅ Receipt formatting (multi-line, balances, mood rotation)
- ✅ Activity detection (nonce, ETH delta, token delta)
- ✅ State management (UTC reset, trade recording)
- ✅ Phase 1 X Mentions (command parsing, safe replies, deduplication)

All tests are deterministic with mocked viem clients (no network calls). See [tests/README.md](tests/README.md) for details.

**Watch mode** (auto-rerun on code changes):
```bash
npm run test:watch
```

---

### Step 2b: Launch the agent immediately (even before trading)

Start with a stable posting-only runtime for 1–2 hours:

```bash
# recommended stable "posting-only" mode with X API
SOCIAL_MODE=x_api DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true \
  X_API_KEY="..." X_API_SECRET="..." X_ACCESS_TOKEN="..." X_ACCESS_SECRET="..." \
  npm run dev
```

In this mode the agent:
- resolves `TOKEN_ADDRESS` from env OR `deployments/<network>.json`
- reads ETH + INTERN balances
- best-effort price (may be `unknown`)
- **posts SIMULATED receipts ONLY when activity detected**
- tracks: nonce increases, ETH balance changes, token balance changes

#### 2b) Set up X API credentials

X API uses OAuth 1.0a for secure, reliable posting:
1. Create an app at [developer.twitter.com/en/portal/dashboard](https://developer.twitter.com/en/portal/dashboard)
2. Generate **OAuth 1.0a** credentials:
   - Copy `API Key` → `X_API_KEY`
   - Copy `API Secret Key` → `X_API_SECRET`
   - Copy `Access Token` → `X_ACCESS_TOKEN`
   - Copy `Access Token Secret` → `X_ACCESS_SECRET`
3. Set all four in `.env` or as environment variables

**X API features**:
- Circuit breaker: Disables posting for 30 minutes after 3 consecutive failures
- Idempotency: Never posts the same receipt twice (SHA256 fingerprinting)
- Rate-limit aware: Respects X API rate limits with exponential backoff
- All state persisted to `data/state.json` for reliability

**Event-driven posting** (default):
- Posts ONLY when meaningful onchain activity detected
- Triggers: nonce increase, ETH balance change (≥ MIN_ETH_DELTA), token balance change (≥ MIN_TOKEN_DELTA)
- Configure thresholds: `MIN_ETH_DELTA="0.00001"` and `MIN_TOKEN_DELTA="1000"` (optional)
- No timer spam: only posts when wallet actually does something

#### 2c) Phase 1: X Mentions Poller (Intent Recognition)

The agent can also respond to mentions on X with intent recognition (no execution, no trading):

```bash
X_PHASE1_MENTIONS=true X_POLL_MINUTES=2 npm run dev
```

**Configuration** (add to `.env`):
```bash
X_PHASE1_MENTIONS="true"           # Enable mention polling
X_POLL_MINUTES="2"                  # Check for mentions every 2 minutes
X_API_KEY="..."                     # OAuth 1.0a credentials
X_API_SECRET="..."
X_ACCESS_TOKEN="..."
X_ACCESS_SECRET="..."
```

**Supported commands** (case-insensitive):
- `@bot help` → Agent explains features and safety guardrails
- `@bot status` → Agent shows current ETH/INTERN balances, price, and trading status
- `@bot buy` → Agent acknowledges intent but **never executes** (explains why)
- `@bot sell` → Agent acknowledges intent but **never executes** (explains why)
- `@bot why` → Agent explains decision logic and safety limits

**Example conversation**:
```
You: @based_intern help
Agent: based intern here 👀 i can post proof-of-life receipts and execute capped trades
       on base with strict guardrails. learn more: docs/FLOW.md [SIMULATED]

You: @based_intern status
Agent: ETH: 0.123, INTERN: 5000, price: $0.50 🤔 [SIMULATED]

You: @based_intern buy
Agent: 📝 noted: you asked me to buy. but i never execute trades from mentions—only
       from onchain activity detected in my main loop. see: docs/FLOW.md [SIMULATED]
```

**Safety guarantees**:
- ✅ Never executes trades from mentions (intent recognition only)
- ✅ Explains guardrails in every reply
- ✅ Deduplicates replies (SHA256 fingerprinting)
- ✅ Respects 240-char tweet limit (truncates with "…")
- ✅ Runs in parallel to receipt posting (non-blocking)
- ✅ Disabled by default (`X_PHASE1_MENTIONS="false"`)

See [docs/STATUS.md](docs/STATUS.md#social-posting) for architecture details.

---

### Step 3: Enable Live Trading (After 1-2 hours of stable posting)

⚠️ **ONLY after receipts are posting reliably for 1-2 hours**:

```bash
SOCIAL_MODE=x_api TRADING_ENABLED=true KILL_SWITCH=false DRY_RUN=false npm run dev
```

**Required for trading**:
- `ROUTER_TYPE=aerodrome`
- `ROUTER_ADDRESS=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- `POOL_ADDRESS=<your INTERN/WETH pool>`
- `WETH_ADDRESS=0x4200000000000000000000000000000000000006`
- `AERODROME_STABLE=false`

**Pluggable DEX providers** (NEW)

The agent now features a modular DEX provider registry at `src/chain/dex`. A complete Aerodrome adapter is included at `src/chain/dex/aerodromeAdapter.ts`.

**Architecture**:
- **Price oracle**: Registered providers (`getPrice()`) are tried in order until one returns a valid result or all fail (returns "unknown").
- **Trade execution**: Providers can optionally supply calldata builders (`buildBuyCalldata()`, `buildSellCalldata()`), which `src/chain/trade.ts` uses with a fallthrough to the legacy Aerodrome inline implementation.
- **Resilience**: If a pool is removed or unavailable, the agent continues with the deterministic fallback (HOLD) and can be re-enabled by registering an alternate provider.

**To add a provider**:
1. Create a new adapter under `src/chain/dex/`
2. Implement `DexProvider` shape: `{ name, getPrice(), buildBuyCalldata?(), buildSellCalldata?() }`
3. Call `registerDexProvider(adapter)` on module import
4. The agent will automatically discover and use the provider

**Example**: See `src/chain/dex/aerodromeAdapter.ts` for a reference implementation using Aerodrome pools and calldata encoding.

**For SELL trades** (optional, default safe):
- `APPROVE_MAX=false` (default): Approve exact amount needed per trade
- `APPROVE_MAX=true`: Approve MaxUint256 (unlimited, one approval per wallet)

In this mode the agent:
- reads on-chain pool data (reserves, prices)
- proposes BUY/SELL actions via LangChain (if `OPENAI_API_KEY` set)
- enforces strict guardrails (daily cap, min interval, max spend)
- **automatically handles ERC20 approvals for SELL trades** (checks allowance, approves if needed)
- executes swaps via Aerodrome with slippage protection
- posts **LIVE** receipts with transaction hashes

If posting fails, the agent logs the error and **keeps running**.

## Security warnings
- Use a **fresh wallet** with tiny funds.
- Never commit secrets (`.env`).
- Leave `KILL_SWITCH=true` and `TRADING_ENABLED=false` until you explicitly opt in.

---

## Architecture: DEX Provider System

The agent uses a pluggable DEX provider architecture for price discovery and trade routing.

### Provider Interface

```typescript
type DexProvider = {
  name: string;
  getPrice: (cfg: AppConfig, clients: ChainClients, token: Address, weth: Address) => Promise<PriceResult | null>;
  buildBuyCalldata?: (cfg, clients, token, weth, wallet, spendEth) => Promise<SwapCalldata | null>;
  buildSellCalldata?: (cfg, clients, token, weth, wallet, sellAmount) => Promise<SwapCalldata | null>;
};
```

### How It Works

1. **Price Discovery** (`src/chain/price.ts`):
   - Calls each registered provider's `getPrice()` in order
   - Returns the first successful result or "unknown"
   - Example: Aerodrome adapter queries pool reserves and calculates price

2. **Trade Execution** (`src/chain/trade.ts`):
   - Attempts to use provider's `buildBuyCalldata()` or `buildSellCalldata()` if available
   - Falls back to legacy inline Aerodrome logic
   - This allows old code to work while supporting new providers

3. **Registration** (`src/chain/dex/index.ts`):
   - Providers auto-register on module import via `registerDexProvider()`
   - Example: Aerodrome adapter auto-registers at `src/chain/dex/aerodromeAdapter.ts`

### Aerodrome Adapter (Reference Implementation)

Located at `src/chain/dex/aerodromeAdapter.ts`:
- **`getPrice()`**: Reads pool reserves from Aerodrome, calculates 1 INTERN = X ETH
- **`buildBuyCalldata()`**: Returns calldata for WETH→INTERN swap with slippage protection
- **`buildSellCalldata()`**: Returns calldata for INTERN→WETH swap with slippage protection
- All methods gracefully return `null` if configuration is missing or pool is unavailable

### Adding a Custom Provider

1. Create `src/chain/dex/myAdapter.ts`:
   ```typescript
   import { registerDexProvider } from "./index.js";

   export const MyAdapter = {
     name: "my-dex",
     getPrice: async (cfg, clients, token, weth) => {
       // Fetch price from your DEX (API, on-chain, graph, etc.)
       return { text: "$1.50", source: "my-dex" };
     },
     buildBuyCalldata: async (cfg, clients, token, weth, wallet, spendEth) => {
       // Build swap calldata
       return { to: routerAddress, calldata: "0x...", value: spendEth };
     }
   };

   registerDexProvider(MyAdapter);
   ```

2. Import the adapter somewhere in your startup path:
   ```typescript
   import "./src/chain/dex/myAdapter.js";  // Auto-registers
   ```

3. The agent will automatically discover and use your provider for price and execution.

---

## Documentation

- [`docs/FLOW.md`](docs/FLOW.md) - Detailed execution flow and architecture diagrams
- [`docs/STATUS.md`](docs/STATUS.md) - Implementation status and next steps
- [`docs/BUILD.md`](docs/BUILD.md) - Build system, deployment guide, and troubleshooting
- [`docs/RAILWAY.md`](docs/RAILWAY.md) - Deploy as a 24/7 Railway worker

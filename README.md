# Based Intern

A TypeScript + Solidity agent that posts proof-of-life receipts and can execute capped trades on Base (Sepolia/mainnet).

## What is This?

Based Intern is an autonomous agent with a deadpan "unpaid intern" persona that:
- Deploys a simple ERC20 token (INTERN)
- Posts receipts showing wallet balances, prices, and actions
- Detects onchain activity and posts event-driven receipts (no timer spam)
- Can execute trades with strict safety caps (optional, off by default)
- Uses LangChain for intelligent decision-making (or deterministic fallback)
- Provides multiple social posting options: X API (OAuth), Playwright (browser), or local-only
- Phase 1 mention poller: responds to X mentions with intent recognition (no execution)

## Key Features

### Safety & Reliability
- **Safety-First Design**: Trading OFF by default, multiple independent safety checks
- **Startup Validation**: Config errors caught immediately with clear messages
- **Deterministic Fallback**: Smart decisions even without OpenAI API
- **Fail-Safe Architecture**: Continues running even when RPC/posting fails
- **Multiple Safety Layers**: TRADING_ENABLED, KILL_SWITCH, DRY_RUN, daily caps, spend caps, intervals
- **Schema Versioning**: State file can evolve safely with backward compatibility

# Based Intern

**Based Intern** is an autonomous, safety-first trading and proof-of-life agent for Base L2 (Sepolia/mainnet). It posts receipts and executes capped trades on-chain, with a modular, extensible architecture and multiple independent guardrails. The agent is designed for reliability, deterministic fallback, and easy extensibility.

---

## ✨ Features

- **Safety-First Design:** Three independent guardrails (config validation, fallback policy, execution caps) ensure no single failure can cause loss of funds.
- **Modular DEX System:** Supports Aerodrome and HTTP (CoinGecko) adapters; easy to extend for new DEXs or price sources.
- **Deterministic Fallback:** If LLM, RPC, or price oracles fail, agent continues with a conservative, price/balance-aware HOLD policy.
- **Config-Driven:** All runtime behavior is controlled via environment variables, validated at startup (Zod + custom guardrails).
- **State Persistence:** Tracks trade history and resets daily; schema versioned for future migrations.
- **Structured Logging:** All logs are structured; no console.log anywhere.
- **Dual Social Posting:** Posts receipts to X (Twitter) via API or Playwright, or logs locally.
- **Comprehensive Test Suite:** 167 deterministic tests across all modules (as of Jan 2026).
- **Extensible:** Modular provider registry for DEXs, price oracles, and social posting.

---

## 🏗️ Architecture & Flow

```
Config → Chain Clients → Read State → Propose Action → Enforce Guardrails → Execute/Post
   ↓         ↓              ↓              ↓               ↓                    ↓
 Zod      viem       state.json      LangChain      Multi-check           Trade/Post
 valdtn   (viem)     LLM fallback     decision       then execute          to X/chain
```

### Key Files & Directories

- `src/index.ts` — Main loop entrypoint (`tick()`)
- `src/config.ts` — Zod schema validation, config resolution
- `src/agent/brain.ts` — Action proposal (LangChain + fallback policy)
- `src/agent/decision.ts` — Guardrail enforcement (trade caps, intervals)
- `src/chain/dex/` — Modular DEX provider system (Aerodrome, HTTP, registry)
- `src/chain/price.ts` — Pool-agnostic price oracle
- `src/agent/state.ts` — State persistence, schema versioning
- `src/social/` — Social posting (X API, Playwright, mention poller)

---

## 🛡️ Safety Layers

1. **Config validation:** Zod schema + custom guardrails, fail-fast on invalid env
2. **Proposal fallback:** If LLM or price fails, use deterministic, price/balance-aware HOLD policy
3. **Guardrail enforcement:** Hard caps on trades, spend, and intervals (see `enforceGuardrails()`)

**Critical Flags:** (all must be satisfied for live trading)

- `TRADING_ENABLED=true` (default: false)
- `KILL_SWITCH=false` (default: true)
- `DRY_RUN=false` (default: true)
- `ROUTER_ADDRESS` must be set

---

## 🗃️ State & Receipts

- Trades and state are persisted in `data/state.json` (schema versioned, atomic writes)
- Every tick posts a receipt (action, balances, price, tx hash, mode)
- Receipts are the "proof-of-life" moat: every tick, even if no trade

---

## 🔄 Modular DEX & Price Oracle

- **Provider Registry:** All DEX and price adapters are registered in `src/chain/dex/`
- **Aerodrome Adapter:** Native DEX integration (swap, price, slippage protection)
- **HTTP Adapter:** CoinGecko fallback for price (read-only, no trading)
- **Easy Extension:** Add new DEXs or price sources by implementing the provider interface
- **Slippage Protection:** All trades use minOut with slippage bps
- **Pool-Agnostic:** Price oracle works with any registered DEX or HTTP source

---

## 📣 Social Posting

- `SOCIAL_MODE`: `none` (default), `playwright`, `x_api`
- Posts receipts to X (Twitter) via API or Playwright, or logs locally
- Mention poller for event-driven posting (see `src/social/x_mentions.ts`)

---

## 🚀 Quickstart

```bash
git clone https://github.com/yourorg/based-intern.git
cd based-intern
npm install
npm run build
# Compile contracts
npm run build:contracts
# Deploy token (optional)
npm run deploy:token -- --network baseSepolia
# Run agent in safe mode
npm run dev
```

---

## ⚙️ Configuration

Set environment variables in `.env` (see `src/config.ts` for all options):

```
TRADING_ENABLED=false
KILL_SWITCH=true
DRY_RUN=true
ROUTER_TYPE=aerodrome
ROUTER_ADDRESS=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
POOL_ADDRESS=0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc
WETH_ADDRESS=0x4200000000000000000000000000000000000006
AERODROME_STABLE=false
```

---

## 🧪 Testing

```bash
npm run lint
npm run build
npm test
```

---

## 📚 Documentation

- [based-intern/README.md](based-intern/README.md) — Developer guide
- [docs/FLOW.md](based-intern/docs/FLOW.md) — Execution flow
- [docs/STATUS.md](based-intern/docs/STATUS.md) — Feature status

---

## 📝 License

MIT
│   │   └── RAILWAY.md              # Cloud deployment
│   ├── hardhat.config.ts           # Hardhat config (Base networks)
│   ├── tsconfig.json               # TypeScript configuration (ESM)
│   ├── package.json                # Dependencies & scripts
│   └── README.md                   # Detailed usage guide
└── README.md                        # This file
```

## Technology Stack

### Blockchain
- **Solidity** (^0.8.20) with OpenZeppelin for secure ERC20
- **Hardhat** (v2) for contract compilation and deployment
- **viem** (^2) for high-performance chain reads/writes
- **TypeChain** (v8) for type-safe contract interactions

### Agent & Decision-Making
- **LangChain** for tool-calling LLM agent (ChatOpenAI)
- **OpenAI API** (optional: gpt-4o-mini; falls back to deterministic policy)
- **Zod** for type-safe configuration validation
- **Structured logging** for observability

### Development
- **TypeScript** (5.x) with ESM modules
- **Vitest** (v1.6+) for unit testing (167 tests, deterministic)
- **ESLint** for code quality

### Social Posting
- **X API v1.1** with OAuth 1.0a (secure, rate-limit aware)
- **Playwright** (v1.45+) for cookie-based browser automation
- **SHA256** for receipt idempotency fingerprinting

### Infrastructure
- **Node.js** (v20+) runtime
- **Docker** support for cloud deployment (Railway, etc.)

## Test Coverage

- **167 passing tests** across 9 test files
- **Config validation**: 12 tests (all guardrail combinations)
- **Brain fallback policy**: 11 tests (all tiers and signals)
- **State persistence**: 8 tests (field preservation, migrations)
- **Guardrails**: 18 tests (caps, intervals, safety)
- **Receipts**: 22 tests (formatting, moods)
- **Activity watcher**: 32 tests (nonce, balances, edge cases)
- **X Mentions**: 37 tests (parsing, deduplication)
- **DEX provider**: 6 tests (adapter interface, fallback)
- **State management**: 22 tests (persistence, daily resets)

All tests deterministic (no flaky tests, no external calls).

## Safety Features

| Feature | Default | Description |
|---------|---------|-------------|
| `TRADING_ENABLED` | false | Must be explicitly enabled for live trading |
| `KILL_SWITCH` | true | Emergency stop (blocks all trading) |
| `DRY_RUN` | true | Simulates trades without sending transactions |
| `DAILY_TRADE_CAP` | 2 | Max trades per UTC day |
| `MIN_INTERVAL_MINUTES` | 60 | Minimum seconds between trades |
| `MAX_SPEND_ETH_PER_TRADE` | 0.0005 | Max ETH to spend per trade |
| `SELL_FRACTION_BPS` | 500 | Max 5% of holdings per sell |
| `SLIPPAGE_BPS` | 300 | Max 3% slippage tolerance |

## Receipt Example

```
BASED INTERN REPORT
action: HOLD
wallet: 0x1234...5678
eth: 0.01
intern: 1000000
price: $0.42
tx: -
mode: SIMULATED
note: Still unpaid. Still posting.
```

## Getting Help

1. **Read the docs**: Start with [based-intern/README.md](based-intern/README.md)
2. **Check FLOW.md**: Visual execution diagrams and decision trees
3. **Review STATUS.md**: Complete feature inventory and limitations
4. **Run tests**: `npm run test` to verify your setup
5. **Enable debug**: `DEBUG=*` for detailed logging

## License

MIT

## Security Warning

Use a fresh wallet with minimal funds. Never commit secrets. Keep safety caps conservative.


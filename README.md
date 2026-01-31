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

### Activity & Posting
- **Proof-of-Life Receipts**: Standardized receipt format (the "moat")
- **Event-Driven Posting**: Posts ONLY when wallet activity detected (no spam)
  - Detects: nonce increases, ETH balance changes, token balance changes
  - Configurable thresholds: `MIN_ETH_DELTA`, `MIN_TOKEN_DELTA`
- **Idempotency**: Never posts the same receipt twice (SHA256 fingerprinting)
- **Circuit Breaker**: Auto-disables posting for 30 min after 3 consecutive failures

### Trading Capabilities
- **Modular DEX System**: Supports Aerodrome and custom DEX adapters
- **Pool-Agnostic Price Oracle**: Falls back to HTTP (CoinGecko) if Aerodrome pool unavailable
- **Capped Trading**: Daily limits, spend caps, minimum intervals
- **Smart Fallback Decisions**: 
  - Tier 1: No INTERN → BUY (establish position)
  - Tier 2: Low ETH → SELL (rebalance)
  - Tier 3: Price available → threshold-based (BUY <$0.50, SELL >$2.00)
  - Tier 4: No signal → probabilistic HOLD/BUY/SELL

### Intelligence & Extensibility
- **LangChain Brain**: OpenAI GPT-4o-mini for context-aware decisions
- **Tool-Calling Loop**: Agent can query wallet state before deciding
- **Deterministic Fallback**: Always makes reasonable decisions (conservative)
- **Provider Registry**: Pluggable DEX adapters for custom routing

### Social Posting
- **X API (OAuth 1.0a)**: Secure, rate-limit aware, idempotency built-in
- **Playwright (Browser)**: Cookie-based automation for accounts without API access
- **Phase 1 Mentions**: Responds to mentions with intent recognition, explains decisions
- **Local-Only Mode**: Safe testing without posting anything

## Deployment Targets
- **Base Sepolia (84532)** - Testnet
- **Base mainnet (8453)** - Production

## Quick Start

```bash
cd based-intern
npm install
cp .env.example .env
# Edit .env with your PRIVATE_KEY and RPC URLs

npm run build:contracts
npm run deploy:token -- --network baseSepolia
npm run dev
```

See [based-intern/README.md](based-intern/README.md) for the complete 3-step execution path.

## Documentation

- **[Detailed Usage Guide](based-intern/README.md)** - Configuration, 3-step execution, trading setup
- **[Execution Flow](based-intern/docs/FLOW.md)** - Step-by-step data flow, decision trees, safety checks
- **[Implementation Status](based-intern/docs/STATUS.md)** - Feature inventory, architecture, known limitations
- **[Build & Deployment](based-intern/docs/BUILD.md)** - Installation, compilation, deployment, troubleshooting
- **[Railway Deployment](based-intern/docs/RAILWAY.md)** - Docker, cloud deployment, environment variables

## Project Structure

```
baseintern/
├── based-intern/                    # Main project directory
│   ├── contracts/                   # Solidity contracts (ERC20 token)
│   ├── scripts/                     # Hardhat deployment + utility scripts
│   ├── src/
│   │   ├── index.ts                # Main event loop (tick handler)
│   │   ├── config.ts               # Zod-validated environment configuration
│   │   ├── logger.ts               # Structured JSON logging
│   │   ├── agent/                  # LangChain & decision-making
│   │   │   ├── brain.ts            # Action proposal (LLM + fallback)
│   │   │   ├── decision.ts         # Guardrail enforcement
│   │   │   ├── prompt.ts           # System prompt + tool definitions
│   │   │   ├── receipts.ts         # Receipt formatting
│   │   │   ├── state.ts            # Persistent state (migrations)
│   │   │   ├── tools.ts            # LangChain tool definitions
│   │   │   ├── watch.ts            # Activity detection
│   │   │   ├── x_mentions.ts       # X mention parsing
│   │   └── chain/                  # Blockchain interaction (viem)
│   │   │   ├── client.ts           # Public + wallet clients
│   │   │   ├── chains.ts           # Chain definitions (Base)
│   │   │   ├── erc20.ts            # ERC20 reads/approvals
│   │   │   ├── price.ts            # Provider-driven price oracle
│   │   │   ├── aerodrome.ts        # Aerodrome DEX queries
│   │   │   ├── trade.ts            # Swap execution
│   │   │   └── dex/                # Modular DEX provider system
│   │   │       ├── index.ts        # Registry interface
│   │   │       ├── aerodromeAdapter.ts  # Aerodrome provider
│   │   │       └── httpAdapter.ts  # HTTP (CoinGecko) fallback
│   │   └── social/                 # Social media posting
│   │       ├── poster.ts           # Factory (mode-agnostic)
│   │       ├── x_api.ts            # X API (OAuth 1.0a)
│   │       ├── x_playwright.ts     # X Playwright (cookies)
│   │       └── x_mentions.ts       # Mention poller
│   ├── tests/                      # Comprehensive test suite (167 tests)
│   │   ├── config.test.ts          # Config validation
│   │   ├── brain.test.ts           # Fallback policy
│   │   ├── decision.test.ts        # Guardrails
│   │   ├── receipts.test.ts        # Receipt formatting
│   │   ├── state.test.ts           # State management
│   │   ├── state-persistence.test.ts  # Schema migration
│   │   ├── watch.test.ts           # Activity detection
│   │   ├── x_mentions.test.ts      # Mention parsing
│   │   └── dex.test.ts             # DEX provider system
│   ├── docs/                       # Comprehensive documentation
│   │   ├── FLOW.md                 # 3-step execution flow
│   │   ├── STATUS.md               # Feature inventory
│   │   ├── BUILD.md                # Build & deployment
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


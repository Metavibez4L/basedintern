# Based Intern

A TypeScript + Solidity agent that posts proof-of-life receipts and can execute capped trades on Base (Sepolia/mainnet).

## What is This?

Based Intern is an autonomous agent with a deadpan "unpaid intern" persona that:
- Deploys a simple ERC20 token (INTERN)
- Posts receipts showing wallet balances, prices, and actions
- Can execute trades with strict safety caps (optional)
- Uses LangChain for intelligent decision-making
- Posts to X (Twitter) via Playwright

## Key Features

- **Safety-First Design**: Trading OFF by default, multiple independent safety checks
- **Proof-of-Life Receipts**: Every tick posts a standardized receipt (the "moat")
- **Capped Trading**: Daily limits, spend caps, minimum intervals
- **LangChain Brain**: Uses OpenAI for decisions (or deterministic fallback)
- **Resilient**: Continues running even when RPC/posting fails
- **Base Native**: Supports Base Sepolia (testnet) and Base mainnet

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

See [`based-intern/README.md`](based-intern/README.md) for the complete 3-step execution path.

## Documentation

- **[Quick Start Guide](based-intern/README.md)** - 3-step execution path
- **[Execution Flow](based-intern/docs/FLOW.md)** - Detailed flow diagrams and architecture
- **[Implementation Status](based-intern/docs/STATUS.md)** - What's done, what's scaffolded, next steps
- **[Build & Deployment](based-intern/docs/BUILD.md)** - Installation, deployment, troubleshooting

## Project Structure

```
baseintern/
├── based-intern/           # Main project directory
│   ├── contracts/          # Solidity contracts
│   ├── scripts/            # Hardhat deployment scripts
│   ├── src/                # TypeScript agent source
│   │   ├── agent/          # Brain, guardrails, receipts
│   │   ├── chain/          # viem integration
│   │   └── social/         # X posting (Playwright)
│   ├── docs/               # Comprehensive documentation
│   └── README.md           # Detailed usage guide
└── README.md               # This file
```

## Receipt Example

```
BASED INTERN REPORT
action: HOLD
wallet: 0x1234...5678
eth: 0.01
intern: 1000000
price: unknown
tx: -
mode: SIMULATED
note: Still unpaid. Still posting.
```

## Safety Features

- **DRY_RUN** mode for simulated transactions
- **KILL_SWITCH** for emergency stops
- **TRADING_ENABLED** must be explicitly set to true
- **Daily trade cap** (default: 2 trades/day)
- **Max spend per trade** (default: 0.0005 ETH)
- **Minimum interval** between trades (default: 60 minutes)
- **Multiple independent checks** before any transaction

## Technology Stack

- **Solidity** (^0.8.20) + OpenZeppelin for contracts
- **Hardhat** (v2) for compilation and deployment
- **TypeScript** (ESM) for agent runtime
- **viem** for blockchain reads/writes
- **LangChain** for intelligent agent decisions
- **Playwright** for social media posting
- **Zod** for config validation

## License

MIT

## Security Warning

Use a fresh wallet with minimal funds. Never commit secrets. Keep safety caps tiny.


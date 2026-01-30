# Based Intern - Build & Deployment Guide

## Prerequisites

### Required
- **Node.js**: v20 or higher
- **npm**: v9 or higher (comes with Node.js)
- **Git**: For cloning and version control

### For Deployment
- **Funded wallet**: ETH on Base Sepolia or Base mainnet for gas
- **RPC endpoint**: Alchemy, Infura, or public RPC for Base networks

### Optional
- **OpenAI API key**: For LangChain agent (works without it via deterministic fallback)
- **X account**: For social posting via Playwright

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/Metavibez4L/basedintern.git
cd basedintern/based-intern
```

### 2. Install Dependencies

```bash
npm install
```

**Expected output**:
```
added 716 packages in 18s
```

**Note**: You may see deprecation warnings for some dependencies (glob, inflight, etc.). These are from Hardhat and can be safely ignored.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set required variables:

```bash
# Required: Your deployer wallet private key (0x prefix optional)
PRIVATE_KEY="your_private_key_here"

# Required: RPC endpoints
BASE_SEPOLIA_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"

# Required: Which network to use
CHAIN="base-sepolia"  # or "base" for mainnet
```

**Security Warning**: 
- Use a fresh wallet with only enough ETH for gas
- Never commit `.env` to git
- Keep `PRIVATE_KEY` secure

---

## Building

### Compile Solidity Contracts

```bash
npm run build:contracts
```

**Expected output**:
```
Generating typings for: 8 artifacts in dir: typechain-types for target: ethers-v6
Successfully generated 34 typings!
Compiled 6 Solidity files successfully (evm target: paris).
```

**What this does**:
- Compiles `contracts/BasedInternToken.sol`
- Generates TypeScript types in `typechain-types/`
- Creates artifacts in `artifacts/` (gitignored)

### Compile TypeScript Sources

```bash
npm run build
```

**Expected output**:
```
(no output = success)
```

**What this does**:
- Compiles all TS files in `src/`, plus `hardhat.config.ts` and `scripts/`
- Outputs to `dist/` (gitignored)
- Validates types across entire codebase

### Lint Code

```bash
npm run lint
```

**What this does**:
- Runs ESLint on all `.ts` files
- Checks for unused variables and basic issues

---

## Deployment

### Step 1: Compile Contracts

```bash
npm run build:contracts
```

### Step 2: Deploy Token

#### Base Sepolia (Testnet)

```bash
npm run deploy:token -- --network baseSepolia
```

**Expected output**:
```
token address: 0x...
deployer address: 0x...
chainId: 84532
tx hash: 0x...
saved deployment: /path/to/deployments/baseSepolia.json
```

#### Base Mainnet (Production)

```bash
npm run deploy:token -- --network base
```

**Expected output**: Similar to above, but `chainId: 8453`

### Known deployments

- Base Sepolia (84532): `0x23926b2CA264e1CD1Fc641E1C5C6e9f2066c91c1`
- Base mainnet (8453): `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11` (verified: `https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11#code`)

### Step 3: Verify Deployment

Check `deployments/<network>.json`:

```json
{
  "token": "0x...",
  "deployer": "0x...",
  "chainId": 84532,
  "timestamp": "2026-01-29T00:20:13.843Z"
}
```

### Step 4: (Optional) Verify on Block Explorer (BaseScan)

This repo supports BaseScan verification via Hardhat.

1) Set env:

```bash
BASESCAN_API_KEY="your_basescan_api_key"
```

2) Verify:

```bash
# Base Sepolia
npx hardhat verify --network baseSepolia <TOKEN_ADDRESS>

# Base mainnet
npx hardhat verify --network base <TOKEN_ADDRESS>
```

---

## Running the Agent

### Development Mode (Safe)

Start the agent in safe posting-only mode:

```bash
npm run dev
```

**Default behavior** (from `.env` defaults):
- `DRY_RUN=true` → No real transactions
- `TRADING_ENABLED=false` → Trading blocked
- `KILL_SWITCH=true` → Additional safety
- `SOCIAL_MODE=none` → Logs receipts only

**Expected output**:
```json
{"ts":"2026-01-29T00:19:18.413Z","level":"info","msg":"based-intern starting","chain":"base-sepolia","socialMode":"none","dryRun":true,"tradingEnabled":false,"killSwitch":true,"loopMinutes":30}
{"ts":"2026-01-29T00:19:18.529Z","level":"info","msg":"SOCIAL_MODE=none (logging receipt only)","receipt":"BASED INTERN REPORT\naction: HOLD\nwallet: 0x1234...5678\neth: 0.01\nintern: 0\nprice: unknown\ntx: -\nmode: SIMULATED\nnote: Still unpaid. Still posting."}
{"ts":"2026-01-29T00:19:18.529Z","level":"info","msg":"guardrails blocked trade","blockedReason":"TRADING_ENABLED=false"}
```

Agent will loop every `LOOP_MINUTES` (default: 30).

### Posting Mode with Playwright

Enable X posting via Playwright:

```bash
SOCIAL_MODE=playwright npm run dev
```

**Prerequisites**:
- Set `X_COOKIES_PATH` in `.env` (recommended), OR
- Set `X_USERNAME` and `X_PASSWORD` in `.env`

**Creating cookies file**:
Recommended (most reliable): generate Playwright `storageState` using the helper script.

```bash
# opens a real browser window; log in manually; press ENTER in terminal
npm run x:cookies
```

This writes the file at `X_COOKIES_PATH` (default `./x_cookies.json`).

Alternative (manual export):
1. Log into X.com in a browser
2. Export cookies (use browser extension or dev tools)
3. Convert to Playwright format (array of cookie objects) or a Playwright `storageState` object
4. Save as `x_cookies.json`
5. Set `X_COOKIES_PATH=./x_cookies.json` in `.env`

### Live Trading Mode (DANGEROUS)

⚠️ **Only after verifying posting mode works for 1-2 hours** ⚠️

```bash
SOCIAL_MODE=playwright \
DRY_RUN=false \
TRADING_ENABLED=true \
KILL_SWITCH=false \
npm run dev
```

**Prerequisites**:
- Router must be configured (`ROUTER_TYPE`, `ROUTER_ADDRESS`, etc.)
- Trading execution must be implemented (currently scaffolded)
- Start with tiny caps (default `MAX_SPEND_ETH_PER_TRADE=0.0005`)

---

## Configuration Reference

### Network Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `CHAIN` | Which network to use | `base-sepolia` or `base` |
| `BASE_SEPOLIA_RPC_URL` | RPC for Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASE_RPC_URL` | RPC for Base mainnet | `https://base-mainnet.g.alchemy.com/v2/KEY` |
| `RPC_URL` | Override RPC (optional) | Same format as above |
| `TOKEN_ADDRESS` | Token address (optional) | Auto-read from `deployments/<network>.json` |

### Wallet Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `WALLET_MODE` | Wallet type | `private_key` |
| `PRIVATE_KEY` | Private key (with or without 0x) | (required) |

### Safety Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `DRY_RUN` | Simulate transactions | `true` |
| `TRADING_ENABLED` | Enable trading | `false` |
| `KILL_SWITCH` | Emergency stop | `true` |
| `DAILY_TRADE_CAP` | Max trades per day | `2` |
| `MIN_INTERVAL_MINUTES` | Min time between trades | `60` |
| `MAX_SPEND_ETH_PER_TRADE` | Max ETH per buy | `0.0005` |
| `SELL_FRACTION_BPS` | % of holdings to sell | `500` (5%) |
| `SLIPPAGE_BPS` | Slippage tolerance | `300` (3%) |

### Agent Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `LOOP_MINUTES` | Tick interval in minutes | `30` |
| `OPENAI_API_KEY` | OpenAI key for LangChain (optional) | (none) |

### Social Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `SOCIAL_MODE` | Posting mode | `none` |
| `HEADLESS` | Run Playwright headless | `true` |
| `X_USERNAME` | X username (fallback) | (none) |
| `X_PASSWORD` | X password (fallback) | (none) |
| `X_COOKIES_PATH` | Path to cookies JSON (preferred) | `./x_cookies.json` |

---

## Troubleshooting

### Build Issues

#### Error: "Cannot find module 'hardhat'"

**Solution**:
```bash
npm install
```

#### Error: "File is not under 'rootDir'"

**Solution**: Already fixed in `tsconfig.json` (rootDir: ".")

#### Playwright type errors

**Solution**: Already fixed in `src/social/x_playwright.ts`

### Deployment Issues

#### Error: "PRIVATE_KEY is required"

**Solution**: Set `PRIVATE_KEY` in `.env`

#### Error: "insufficient funds for gas"

**Solution**: Fund your wallet with ETH on the target network

#### Error: "cannot estimate gas"

**Solution**: 
- Check RPC URL is correct
- Verify network is reachable
- Ensure wallet has ETH for gas

### Runtime Issues

#### Agent doesn't start

**Check**:
1. `.env` file exists and has required vars
2. RPC URLs are valid and reachable
3. Run `npm run build` first to check for TS errors

#### Receipts show "unknown" price

**Expected**: Price oracle is not implemented yet. This is normal.

#### Posting to X fails

**Check**:
1. `X_COOKIES_PATH` file exists and is valid JSON
2. Cookies haven't expired (re-export from browser)
3. X login flow hasn't changed (selectors may need update)
4. Try username/password fallback

#### Agent stops after one tick

**Check**: This is normal in DRY_RUN mode. Agent loops every `LOOP_MINUTES`.

---

## Directory Structure

```
based-intern/
├── contracts/              # Solidity contracts
│   └── BasedInternToken.sol
├── scripts/                # Hardhat deployment scripts
│   └── deploy-token.ts
├── src/                    # TypeScript agent source
│   ├── index.ts            # Main loop
│   ├── config.ts           # Env config
│   ├── logger.ts           # Logging
│   ├── agent/              # Agent brain
│   │   ├── brain.ts        # LangChain integration
│   │   ├── decision.ts     # Guardrails
│   │   ├── receipts.ts     # Receipt formatting
│   │   ├── state.ts        # State persistence
│   │   ├── prompt.ts       # System prompt
│   │   └── tools.ts        # LangChain tools
│   ├── chain/              # Blockchain integration
│   │   ├── client.ts       # viem clients
│   │   ├── chains.ts       # Network configs
│   │   ├── erc20.ts        # Token reads
│   │   ├── price.ts        # Price oracle (stub)
│   │   └── trade.ts        # Trading (stub)
│   └── social/             # Social posting
│       ├── poster.ts       # Mode router
│       ├── x_playwright.ts # Playwright posting
│       └── x_api.ts        # X API posting (OAuth 1.0a)
├── deployments/            # Deployment JSONs (created on deploy)
│   ├── .gitkeep
│   ├── baseSepolia.json    # (gitignored)
│   └── base.json           # (gitignored)
├── data/                   # Runtime state (created on first run)
│   ├── .gitkeep
│   └── state.json          # (gitignored)
├── docs/                   # Documentation
│   ├── FLOW.md             # Execution flow
│   ├── STATUS.md           # Implementation status
│   └── BUILD.md            # This file
├── .env.example            # Example environment file
├── .gitignore              # Git ignore patterns
├── eslint.config.js        # ESLint config
├── hardhat.config.ts       # Hardhat config
├── package.json            # NPM config
├── tsconfig.json           # TypeScript config
└── README.md               # Quick start guide
```

### Generated Directories (Gitignored)

```
├── node_modules/           # NPM packages
├── dist/                   # Compiled TS output
├── artifacts/              # Hardhat build artifacts
├── cache/                  # Hardhat cache
├── typechain-types/        # Generated contract types
```

---

## npm Scripts Reference

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript sources |
| `npm run lint` | Run ESLint on TypeScript files |
| `npm run build:contracts` | Compile Solidity contracts |
| `npm run deploy:token` | Deploy token (requires `--network` flag) |
| `npm run dev` | Run agent in development mode |

---

## Next Steps

1. ✅ Clone and install dependencies
2. ✅ Configure `.env` with wallet + RPC
3. ✅ Compile contracts: `npm run build:contracts`
4. ✅ Deploy token: `npm run deploy:token -- --network baseSepolia`
5. ✅ Run agent in safe mode: `npm run dev`
6. ⏳ Observe receipts for 1-2 hours
7. ⏳ Implement trading execution (`src/chain/trade.ts`)
8. ⏳ Enable live trading with tiny caps

See [`docs/FLOW.md`](./FLOW.md) for detailed execution flow.

See [`docs/STATUS.md`](./STATUS.md) for implementation status.

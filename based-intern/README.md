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

### Step 2: Launch the agent immediately (even before trading)

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
- posts **SIMULATED** receipts (no txs)

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

In this mode the agent:
- reads on-chain pool data (reserves, prices)
- proposes BUY/SELL actions via LangChain (if `OPENAI_API_KEY` set)
- enforces strict guardrails (daily cap, min interval, max spend)
- executes swaps via Aerodrome with slippage protection
- posts **LIVE** receipts with transaction hashes

If posting fails, the agent logs the error and **keeps running**.

#### Note on Railway deployments

Railway and other cloud providers work best with X API, which doesn't require browser automation. Use:

```bash
SOCIAL_MODE=x_api npm run dev
```

Set the OAuth 1.0a user credentials (posting account):
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`

---

### Step 3: Flip to LIVE carefully (caps small)

Only flip to live when you are ready:

#### Note on Railway deployments

Railway and other cloud providers work best with X API, which doesn't require browser automation. Use:

```bash
SOCIAL_MODE=x_api npm run dev
```

## Security warnings
- Use a **fresh wallet** with tiny funds.
- Never commit secrets (`.env`).
- Leave `KILL_SWITCH=true` and `TRADING_ENABLED=false` until you explicitly opt in.

---

## Documentation

- [`docs/FLOW.md`](docs/FLOW.md) - Detailed execution flow and architecture diagrams
- [`docs/STATUS.md`](docs/STATUS.md) - Implementation status and next steps
- [`docs/BUILD.md`](docs/BUILD.md) - Build system, deployment guide, and troubleshooting
- [`docs/RAILWAY.md`](docs/RAILWAY.md) - Deploy as a 24/7 Railway worker

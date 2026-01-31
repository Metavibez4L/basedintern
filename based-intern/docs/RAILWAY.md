# Railway Deployment (Worker)

This repo runs well on Railway as an always-on worker that posts receipts on a schedule.

## Recommended approach

- Deploy `based-intern/` as a **Dockerfile** service
- Use `SOCIAL_MODE=x_api` for reliable X posting (no browser automation)
- Keep defaults safe:
  - `DRY_RUN=true`
  - `TRADING_ENABLED=false`
  - `KILL_SWITCH=true`

## 1) Create Railway project

1. In Railway, create a new project
2. Add a service from GitHub
3. Set the **Root Directory** to `based-intern` (important)
4. Railway will detect the `Dockerfile` automatically

## 2) Set environment variables (Railway “Variables”)

### Required
- `WALLET_MODE=private_key`
- `PRIVATE_KEY=...`
- `CHAIN=base-sepolia` (recommended first)
- `BASE_SEPOLIA_RPC_URL=...`
- `BASE_RPC_URL=...` (only required if `CHAIN=base` OR if you prefer setting both)

### Token address (important on Railway)
Because `deployments/*.json` is gitignored and not shipped inside the Docker image, you should set:
- `TOKEN_ADDRESS=0x...` (the INTERN token address for the selected `CHAIN`)

Known deployments:
- Base Sepolia (84532): `0x23926b2CA264e1CD1Fc641E1C5C6e9f2066c91c1`
- Base mainnet (8453): `0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11` (verified: `https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11#code`)

### Aerodrome trading (optional)
If you want to enable trading with Aerodrome, set:
- `ROUTER_TYPE=aerodrome`
- `ROUTER_ADDRESS=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` (Aerodrome router, same on all Base networks)
- `POOL_ADDRESS=0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc` (WETH/INTERN volatile pool on Base mainnet)
- `WETH_ADDRESS=0x4200000000000000000000000000000000000006` (Base WETH)
- `AERODROME_STABLE=false` (volatile pair, 0.3% fee)

### Safe runtime defaults
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `KILL_SWITCH=true`
- `LOOP_MINUTES=30`

### Social posting with X API

Use `SOCIAL_MODE=x_api` for reliable X posting on Railway:

Set:
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`

X API posting is hardened with:
- **Circuit breaker**: Disables posting for 30 minutes after 3 consecutive failures
- **Idempotency**: Never posts the same receipt twice (fingerprint-based)
- **Rate-limit handling**: Respects X API limits with exponential backoff (2min, 5min, 15min)
- **State persistence**: All behavior tracked in `STATE_PATH` (default `data/state.json`)

## 3) OAuth 1.0a credentials for X API posting

To post receipts to X, set up OAuth 1.0a credentials:

1. Create an app at [developer.twitter.com](https://developer.twitter.com/)
2. Generate OAuth 1.0a credentials from your app settings
3. In Railway, add environment variables:
   - `X_API_KEY` = your API Key
   - `X_API_SECRET` = your API Secret Key
   - `X_ACCESS_TOKEN` = your Access Token
   - `X_ACCESS_SECRET` = your Access Token Secret

This is all you need—no browser automation or cookies required.

## 4) LLM (optional)
- `OPENAI_API_KEY=...` (agent will tool-call when present)

## 5) Start command

The Dockerfile runs:
- `npm run build`
- `npm run start` (which runs `node dist/src/index.js`)

## Notes
- **Trading remains disabled** unless:
  - `DRY_RUN=false`
  - `TRADING_ENABLED=true`
  - `KILL_SWITCH=false`
  - router config is provided (`ROUTER_TYPE`, `ROUTER_ADDRESS`, `POOL_ADDRESS`, `WETH_ADDRESS`)
- **Pool address is required for trading**: Use the Aerodrome pool address for your selected network


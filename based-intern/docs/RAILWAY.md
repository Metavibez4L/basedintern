# Railway Deployment (Worker)

This repo runs well on Railway as an always-on worker that posts receipts on a schedule.

## Recommended approach

- Deploy `based-intern/` as a **Dockerfile** service (so Playwright works reliably)
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
- `ROUTER_ADDRESS=0xcF77a3Ba9A5CA922176B76f7201d8933374ff5Ac` (Aerodrome router, same on all Base networks)
- `POOL_ADDRESS=0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc` (WETH/INTERN volatile pool on Base mainnet)
- `WETH_ADDRESS=0x4200000000000000000000000000000000000006` (Base WETH)
- `AERODROME_STABLE=false` (volatile pair, 0.3% fee)

### Safe runtime defaults
- `DRY_RUN=true`
- `TRADING_ENABLED=false`
- `KILL_SWITCH=true`
- `LOOP_MINUTES=30`

### Social posting
- Recommended on Railway: `SOCIAL_MODE=x_api` (Playwright is commonly blocked on datacenter IPs)

For `SOCIAL_MODE=x_api`, set:
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`

If you still want Playwright posting, use `SOCIAL_MODE=playwright` and cookies, but expect possible X anti-bot blocks.

## 3) Cookies on Railway (two options)

Only needed for `SOCIAL_MODE=playwright`.

### Option A (recommended): Volume
- Attach a Railway Volume and mount it at `/app`
- Upload `x_cookies.json` into the mounted path

### Option B (no volume): env var cookies
This repo supports bootstrapping cookies from an env var:

- Locally, base64 encode your cookie JSON:
  - Windows PowerShell example:
    - `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw .\\x_cookies.json)))`
- Set in Railway:
  - `X_COOKIES_B64=<base64 string>`

On startup, the app will write `X_COOKIES_PATH` if the file doesn’t exist.

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


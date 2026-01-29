# based-intern

Senior TS + Solidity scaffold for a “Based Intern” agent that can post proof-of-life receipts and (optionally) trade with strict safety caps.

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

Verification is optional. If you want it, add a Base explorer API key + verify plugin, then run Hardhat verify with the deployed address. This repo keeps verification out-of-the-box to stay minimal.

---

### Step 2: Launch the agent immediately (even before trading)

Start with a stable posting-only runtime for 1–2 hours:

```bash
# recommended stable “posting-only” mode
SOCIAL_MODE=playwright DRY_RUN=true TRADING_ENABLED=false KILL_SWITCH=true npm run dev
```

In this mode the agent:
- resolves `TOKEN_ADDRESS` from env OR `deployments/<network>.json`
- reads ETH + INTERN balances
- best-effort price (may be `unknown`)
- posts **SIMULATED** receipts (no txs)

#### 2b) Troubleshoot X posting (Playwright)

Cookies are preferred to reduce login friction:
- Create `x_cookies.json` by logging into X once in a Playwright session (or export cookies from your browser and convert to Playwright format).
- Set `X_COOKIES_PATH=./x_cookies.json`

If cookies fail, the fallback is `X_USERNAME` + `X_PASSWORD`.

If posting fails, the agent logs the error and **keeps running**.

---

### Step 3: Flip to LIVE carefully (caps small)

Only flip to live when you are ready:

```bash
SOCIAL_MODE=playwright DRY_RUN=false TRADING_ENABLED=true KILL_SWITCH=false npm run dev
```

Safety caps you should keep tiny (defaults are already conservative):
- `DAILY_TRADE_CAP=1–3`
- `MAX_SPEND_ETH_PER_TRADE` tiny (default `0.0005`)

Trading is **OFF by default** and only executes when:
- `TRADING_ENABLED=true`
- `KILL_SWITCH=false`
- `DRY_RUN=false`
- router config present (`ROUTER_TYPE` + `ROUTER_ADDRESS`, etc.)

## Security warnings
- Use a **fresh wallet** with tiny funds.
- Never commit secrets (`.env`).
- Leave `KILL_SWITCH=true` and `TRADING_ENABLED=false` until you explicitly opt in.

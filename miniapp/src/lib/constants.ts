// INTERN Token
export const INTERN_TOKEN_ADDRESS =
  "0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11" as const;
export const INTERN_DECIMALS = 18;
export const INTERN_SYMBOL = "INTERN";

// WETH on Base
export const WETH_ADDRESS =
  "0x4200000000000000000000000000000000000006" as const;

// Aerodrome Pool
export const POOL_ADDRESS =
  "0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc" as const;
export const ROUTER_ADDRESS =
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;

// Links
export const AERODROME_DEPOSIT_URL =
  `https://aerodrome.finance/deposit?token0=${WETH_ADDRESS}&token1=${INTERN_TOKEN_ADDRESS}&stable=false`;
export const AERODROME_POOL_URL =
  `https://aerodrome.finance/pools?token0=${WETH_ADDRESS}&token1=${INTERN_TOKEN_ADDRESS}`;
export const BASESCAN_TOKEN_URL = `https://basescan.org/token/${INTERN_TOKEN_ADDRESS}`;
export const BASESCAN_TX_URL = (hash: string) =>
  `https://basescan.org/tx/${hash}`;

// Agent API
export const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8080";

// Moltbook
export const MOLTBOOK_BASE_URL = "https://www.moltbook.com/api/v1";

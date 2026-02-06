import { parseAbi, type Address } from "viem";
import type { ChainClients } from "./client.js";
import { logger } from "../logger.js";

/**
 * Aerodrome pool and swap types.
 * Aerodrome is the Base-native DEX with stable and volatile pools.
 */

export type AerodromePoolInfo = {
  poolAddress: Address;
  token0: Address;
  token1: Address;
  stable: boolean; // true = stable pool, false = volatile
  reserve0: bigint;
  reserve1: bigint;
};

export type AerodromeSwapRoute = {
  poolAddress: Address;
  stable: boolean;
  tokenInAddress: Address;
  tokenOutAddress: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
};

/**
 * Aerodrome Router address (Base mainnet and Sepolia).
 * https://docs.aerodrome.finance/
 */
export const AERODROME_ROUTER_BASE = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const AERODROME_ROUTER_BASE_SEPOLIA = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";

/**
 * Read pool reserves and info from Aerodrome pair.
 * Assumes the pool ABI is standard Uniswap V2-like.
 */
export async function readAerodromePool(
  clients: ChainClients,
  poolAddress: Address,
  stable: boolean
): Promise<AerodromePoolInfo | null> {
  try {
    // Standard ERC20 pair ABI for Aerodrome
    const pairAbi = parseAbi([
      "function token0() public view returns (address)",
      "function token1() public view returns (address)",
      "function getReserves() public view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
    ]);

    const [token0, token1, reserves] = await Promise.all([
      clients.publicClient.readContract({
        address: poolAddress,
        abi: pairAbi,
        functionName: "token0"
      }),
      clients.publicClient.readContract({
        address: poolAddress,
        abi: pairAbi,
        functionName: "token1"
      }),
      clients.publicClient.readContract({
        address: poolAddress,
        abi: pairAbi,
        functionName: "getReserves"
      })
    ]);

    const [reserve0, reserve1] = reserves as [bigint, bigint, number];

    return {
      poolAddress,
      token0,
      token1,
      stable,
      reserve0: BigInt(reserve0),
      reserve1: BigInt(reserve1)
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("aerodrome_pool_read_failed", { poolAddress, stable, error: errorMsg });
    return null;
  }
}

/**
 * Calculate output amount for a given input using Aerodrome constant product formula.
 * For stable pools, uses the stableswap formula. For volatile, uses the standard x*y=k.
 */
export function calculateAerodromeOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  stable: boolean,
  feeBps: number = 100 // Default Aerodrome fee: 1%
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return 0n;
  }

  const feeMultiplier = BigInt(10_000 - feeBps);
  const amountInWithFee = (amountIn * feeMultiplier) / 10_000n;

  if (stable) {
    // Stableswap formula (simplified; Aerodrome uses full implementation)
    // For stable pairs, we assume 1:1 pricing with lower slippage
    return amountInWithFee;
  }

  // Standard Uniswap V2 formula: (amountIn * 997) / (reserve + amountIn * 997)
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

/**
 * Calculate minimum output with slippage tolerance (in basis points).
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  if (slippageBps <= 0) return amount;
  const slippageMultiplier = BigInt(10_000 - slippageBps);
  return (amount * slippageMultiplier) / 10_000n;
}

/**
 * Build swap calldata for Aerodrome router (swapExactTokensForTokens variant).
 * This is for volatility constant-product swaps.
 *
 * RouterV2 interface:
 *   swapExactTokensForTokens(
 *     uint256 amountIn,
 *     uint256 amountOutMin,
 *     Route[] calldata routes,
 *     address to,
 *     uint256 deadline
 *   ) external returns (uint256[] memory amounts);
 *
 * Route is a struct: { from: address, to: address, stable: bool, factory: address }
 */
export function buildAerodromeSwapCalldata(
  amountIn: bigint,
  amountOutMin: bigint,
  route: AerodromeSwapRoute,
  toAddress: Address,
  deadlineSeconds: number = 600
): { calldata: `0x${string}`; deadline: bigint } {
  // Aerodrome Router ABI for swapExactTokensForTokens
  const routerAbi = parseAbi([
    "struct Route { address from; address to; bool stable; address factory; }",
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)"
  ]);

  // Calculate deadline (current time + deadlineSeconds)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  // Encode the Route struct array
  // Route[] = [{ from: tokenInAddress, to: tokenOutAddress, stable: route.stable, factory: AERODROME_FACTORY }]
  const routes = [
    {
      from: route.tokenInAddress,
      to: route.tokenOutAddress,
      stable: route.stable,
      factory: "0xeEF1a33c87e8f8f4E0b0fe8ef72A16D38C7B5a6d" // Aerodrome Factory on Base
    }
  ];

  // Encode calldata using viem's encodeFunctionData pattern
  // We manually construct the calldata for swapExactTokensForTokens
  const selector = "0x32c5c1ec"; // swapExactTokensForTokens selector

  // Encode parameters:
  // - amountIn (uint256): 32 bytes
  // - amountOutMin (uint256): 32 bytes
  // - routes (Route[]): dynamic array with offset
  // - to (address): 32 bytes
  // - deadline (uint256): 32 bytes

  const paddedAmountIn = amountIn.toString(16).padStart(64, "0");
  const paddedAmountOutMin = amountOutMin.toString(16).padStart(64, "0");
  const paddedDeadline = deadline.toString(16).padStart(64, "0");
  const paddedToAddress = toAddress.slice(2).padStart(40, "0").toLowerCase();

  // Routes offset (5 parameters before routes)
  const routesOffset = "a0"; // 160 in hex (5 * 32)
  const routesLength = "01"; // 1 route

  // Encode Route struct: from (32), to (32), stable (32, bool as 0 or 1), factory (32)
  const fromPadded = routes[0].from.slice(2).padStart(40, "0").toLowerCase();
  const toPadded = routes[0].to.slice(2).padStart(40, "0").toLowerCase();
  const stablePadded = routes[0].stable ? "01" : "00";
  const factoryPadded = routes[0].factory.slice(2).padStart(40, "0").toLowerCase();

  const calldata =
    selector +
    paddedAmountIn +
    paddedAmountOutMin +
    routesOffset +
    paddedToAddress.padStart(64, "0") +
    paddedDeadline +
    routesLength +
    fromPadded.padStart(64, "0") +
    toPadded.padStart(64, "0") +
    stablePadded.padStart(64, "0") +
    factoryPadded.padStart(64, "0");

  return {
    calldata: `0x${calldata}` as `0x${string}`,
    deadline
  };
}

// ============================================================
// LIQUIDITY PROVISION
// ============================================================

export type AddLiquidityETHParams = {
  token: Address;
  stable: boolean;
  amountTokenDesired: bigint;
  amountTokenMin: bigint;
  amountETHMin: bigint;
  to: Address;
  deadlineSeconds?: number;
};

export type AddLiquidityParams = {
  tokenA: Address;
  tokenB: Address;
  stable: boolean;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  to: Address;
  deadlineSeconds?: number;
};

export type RemoveLiquidityETHParams = {
  token: Address;
  stable: boolean;
  liquidity: bigint;
  amountTokenMin: bigint;
  amountETHMin: bigint;
  to: Address;
  deadlineSeconds?: number;
};

/**
 * Build calldata for Aerodrome Router addLiquidityETH.
 * Used for INTERN/WETH pools where one side is native ETH.
 *
 * Router interface:
 *   addLiquidityETH(address token, bool stable, uint256 amountTokenDesired,
 *                   uint256 amountTokenMin, uint256 amountETHMin,
 *                   address to, uint256 deadline)
 *   returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
 */
export function buildAddLiquidityETHCalldata(
  params: AddLiquidityETHParams
): { calldata: `0x${string}`; deadline: bigint; value: bigint } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 600));

  // addLiquidityETH selector (without 0x prefix — added in return)
  const selector = "b7e0d4c0";

  const tokenPadded = params.token.slice(2).padStart(64, "0").toLowerCase();
  const stablePadded = (params.stable ? "1" : "0").padStart(64, "0");
  const amtTokenDesired = params.amountTokenDesired.toString(16).padStart(64, "0");
  const amtTokenMin = params.amountTokenMin.toString(16).padStart(64, "0");
  const amtETHMin = params.amountETHMin.toString(16).padStart(64, "0");
  const toPadded = params.to.slice(2).padStart(64, "0").toLowerCase();
  const deadlinePadded = deadline.toString(16).padStart(64, "0");

  const calldata = selector + tokenPadded + stablePadded + amtTokenDesired +
    amtTokenMin + amtETHMin + toPadded + deadlinePadded;

  return {
    calldata: `0x${calldata}` as `0x${string}`,
    deadline,
    value: params.amountETHMin // Send at least this much ETH
  };
}

/**
 * Build calldata for Aerodrome Router addLiquidity.
 * Used for INTERN/USDC pools (two ERC20 tokens).
 *
 * Router interface:
 *   addLiquidity(address tokenA, address tokenB, bool stable,
 *                uint256 amountADesired, uint256 amountBDesired,
 *                uint256 amountAMin, uint256 amountBMin,
 *                address to, uint256 deadline)
 *   returns (uint256 amountA, uint256 amountB, uint256 liquidity)
 */
export function buildAddLiquidityCalldata(
  params: AddLiquidityParams
): { calldata: `0x${string}`; deadline: bigint } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 600));

  // addLiquidity selector (without 0x prefix — added in return)
  const selector = "e8e33700";

  const tokenAPadded = params.tokenA.slice(2).padStart(64, "0").toLowerCase();
  const tokenBPadded = params.tokenB.slice(2).padStart(64, "0").toLowerCase();
  const stablePadded = (params.stable ? "1" : "0").padStart(64, "0");
  const amtADesired = params.amountADesired.toString(16).padStart(64, "0");
  const amtBDesired = params.amountBDesired.toString(16).padStart(64, "0");
  const amtAMin = params.amountAMin.toString(16).padStart(64, "0");
  const amtBMin = params.amountBMin.toString(16).padStart(64, "0");
  const toPadded = params.to.slice(2).padStart(64, "0").toLowerCase();
  const deadlinePadded = deadline.toString(16).padStart(64, "0");

  const calldata = selector + tokenAPadded + tokenBPadded + stablePadded +
    amtADesired + amtBDesired + amtAMin + amtBMin + toPadded + deadlinePadded;

  return {
    calldata: `0x${calldata}` as `0x${string}`,
    deadline
  };
}

/**
 * Build calldata for Aerodrome Router removeLiquidityETH.
 *
 * Router interface:
 *   removeLiquidityETH(address token, bool stable, uint256 liquidity,
 *                      uint256 amountTokenMin, uint256 amountETHMin,
 *                      address to, uint256 deadline)
 *   returns (uint256 amountToken, uint256 amountETH)
 */
export function buildRemoveLiquidityETHCalldata(
  params: RemoveLiquidityETHParams
): { calldata: `0x${string}`; deadline: bigint } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 600));

  // removeLiquidityETH selector (without 0x prefix — added in return)
  const selector = "7a8c63b5";

  const tokenPadded = params.token.slice(2).padStart(64, "0").toLowerCase();
  const stablePadded = (params.stable ? "1" : "0").padStart(64, "0");
  const liquidityPadded = params.liquidity.toString(16).padStart(64, "0");
  const amtTokenMin = params.amountTokenMin.toString(16).padStart(64, "0");
  const amtETHMin = params.amountETHMin.toString(16).padStart(64, "0");
  const toPadded = params.to.slice(2).padStart(64, "0").toLowerCase();
  const deadlinePadded = deadline.toString(16).padStart(64, "0");

  const calldata = selector + tokenPadded + stablePadded + liquidityPadded +
    amtTokenMin + amtETHMin + toPadded + deadlinePadded;

  return {
    calldata: `0x${calldata}` as `0x${string}`,
    deadline
  };
}

/**
 * Read LP token balance for a pool address.
 * Pool tokens are ERC20 — balanceOf returns the LP token balance.
 */
export async function readLPBalance(
  clients: ChainClients,
  poolAddress: Address,
  wallet: Address
): Promise<bigint> {
  try {
    const abi = parseAbi(["function balanceOf(address) public view returns (uint256)"]);
    return await clients.publicClient.readContract({
      address: poolAddress,
      abi,
      functionName: "balanceOf",
      args: [wallet]
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("lp_balance_read_failed", { poolAddress, wallet, error: errorMsg });
    return 0n;
  }
}

/**
 * Read total supply of an LP pool token.
 */
export async function readLPTotalSupply(
  clients: ChainClients,
  poolAddress: Address
): Promise<bigint> {
  try {
    const abi = parseAbi(["function totalSupply() public view returns (uint256)"]);
    return await clients.publicClient.readContract({
      address: poolAddress,
      abi,
      functionName: "totalSupply"
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("lp_totalsupply_read_failed", { poolAddress, error: errorMsg });
    return 0n;
  }
}

/**
 * Calculate pool TVL in ETH terms.
 * For INTERN/WETH pools: TVL = 2 * wethReserve (both sides equal value).
 * For other pairs: returns the raw reserves for external calculation.
 */
export function calculatePoolTVL(
  pool: AerodromePoolInfo,
  wethAddress: Address
): { tvlWei: bigint; reserve0: bigint; reserve1: bigint } {
  const token0Lower = pool.token0.toLowerCase();
  const wethLower = wethAddress.toLowerCase();

  if (token0Lower === wethLower) {
    // WETH is token0 — TVL ≈ 2 * reserve0
    return { tvlWei: pool.reserve0 * 2n, reserve0: pool.reserve0, reserve1: pool.reserve1 };
  } else {
    // WETH is token1 — TVL ≈ 2 * reserve1
    return { tvlWei: pool.reserve1 * 2n, reserve0: pool.reserve0, reserve1: pool.reserve1 };
  }
}

/**
 * Query Aerodrome factory for pool address given two tokens and pool type.
 * Aerodrome Factory interface: getPair(token0, token1, stable) -> address
 */
export async function queryAerodromePool(
  clients: ChainClients,
  factoryAddress: Address,
  token0: Address,
  token1: Address,
  stable: boolean
): Promise<Address | null> {
  try {
    const factoryAbi = parseAbi([
      "function getPair(address token0, address token1, bool stable) public view returns (address pair)"
    ]);

    const pool = await clients.publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "getPair",
      args: [token0, token1, stable]
    });

    // Check if pool exists (non-zero address)
    return pool === "0x0000000000000000000000000000000000000000" ? null : (pool as Address);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("aerodrome_factory_query_failed", { factoryAddress, token0, token1, stable, error: errorMsg });
    return null;
  }
}

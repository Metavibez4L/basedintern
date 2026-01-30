import { parseAbi, type Address } from "viem";
import type { ChainClients } from "./client.js";

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
export const AERODROME_ROUTER_BASE = "0xcF77a3Ba9A5CA922176B76f7201d8933374ff5Ac";
export const AERODROME_ROUTER_BASE_SEPOLIA = "0xcF77a3Ba9A5CA922176B76f7201d8933374ff5Ac";

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
    return null;
  }
}

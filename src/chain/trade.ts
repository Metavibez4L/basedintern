import type { Address } from "viem";
import { maxUint256 } from "viem";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "./client.js";
import { readAerodromePool, calculateAerodromeOutput, applySlippage, AERODROME_ROUTER_BASE, buildAerodromeSwapCalldata } from "./aerodrome.js";
import { readAllowance, approveToken } from "./erc20.js";
import { logger } from "../logger.js";

export type TradeExecutor = {
  executeBuy(spendEth: bigint): Promise<`0x${string}`>;
  executeSell(sellAmount: bigint): Promise<`0x${string}`>;
};

/**
 * Ensure sufficient ERC20 allowance, approving if needed.
 * Returns whether an approval was sent.
 */
async function ensureAllowance(
  publicClient: ChainClients["publicClient"],
  walletClient: ChainClients["walletClient"],
  token: Address,
  owner: Address,
  spender: Address,
  requiredAmount: bigint,
  approveMax: boolean
): Promise<{ didApprove: boolean; approveTxHash?: `0x${string}` }> {
  if (!walletClient) {
    throw new Error("wallet client not available for approval");
  }

  // Read current allowance
  const currentAllowance = await readAllowance(publicClient as any, token, owner, spender);
  logger.info("erc20_allowance_check", {
    token,
    owner,
    spender,
    currentAllowance: currentAllowance.toString(),
    requiredAmount: requiredAmount.toString()
  });

  // If allowance is sufficient, no approval needed
  if (currentAllowance >= requiredAmount) {
    logger.info("erc20_allowance_sufficient", {
      currentAllowance: currentAllowance.toString(),
      requiredAmount: requiredAmount.toString()
    });
    return { didApprove: false };
  }

  // Approval needed
  const approveAmount = approveMax ? maxUint256 : requiredAmount;
  logger.info("erc20_approve_needed", {
    currentAllowance: currentAllowance.toString(),
    requiredAmount: requiredAmount.toString(),
    approveAmount: approveAmount.toString(),
    approveMax
  });

  try {
    const approveTxHash = await approveToken(walletClient, publicClient as any, token, spender, approveAmount);
    logger.info("erc20_approve_submitted", {
      approveTxHash,
      token,
      spender,
      amount: approveAmount.toString()
    });

    // Optionally wait for confirmation (for now, we don't wait to keep things fast)
    // In future, could add APPROVE_CONFIRMATIONS logic here

    return { didApprove: true, approveTxHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("erc20_approve_failed", { error: msg, token, spender });
    throw new Error(`ERC20 approval failed: ${msg}`);
  }
}

/**
 * Trading with Aerodrome support.
 *
 * This integrates Aerodrome (Base-native DEX) for BUY/SELL operations.
 * ROUTER_TYPE must be "aerodrome" to use this implementation.
 * Requires: POOL_ADDRESS, WETH_ADDRESS, AERODROME_STABLE flag.
 *
 * To enable trading, you must set:
 * - ROUTER_TYPE=aerodrome
 * - POOL_ADDRESS=<your INTERN/WETH pool>
 * - WETH_ADDRESS=<wrapped ETH address on Base>
 * - AERODROME_STABLE=true|false (pool type)
 * - TRADING_ENABLED=true
 * - KILL_SWITCH=false
 * - DRY_RUN=false
 */
export function createTradeExecutor(cfg: AppConfig, clients: ChainClients, token: Address): TradeExecutor {
  if (!clients.walletClient) {
    throw new Error("wallet client not available (WALLET_MODE not supported for trading)");
  }

  if (cfg.ROUTER_TYPE !== "aerodrome") {
    throw new Error(`router type ${cfg.ROUTER_TYPE} not implemented; use ROUTER_TYPE=aerodrome`);
  }

  if (!cfg.POOL_ADDRESS || !cfg.WETH_ADDRESS || !cfg.ROUTER_ADDRESS) {
    throw new Error("Aerodrome trading requires: POOL_ADDRESS, WETH_ADDRESS, ROUTER_ADDRESS");
  }

  const poolAddress = cfg.POOL_ADDRESS as Address;
  const wethAddress = cfg.WETH_ADDRESS as Address;
  const routerAddress = cfg.ROUTER_ADDRESS as Address;
  const wallet = clients.walletClient.account?.address;

  if (!wallet) {
    throw new Error("wallet address not available");
  }

  return {
    async executeBuy(spendEth: bigint): Promise<`0x${string}`> {
      try {
        logger.info("aerodrome_buy_start", { spendEth: spendEth.toString(), pool: poolAddress });

        // Try provider-driven calldata if available
        try {
          const { getDexProviders } = await import("./dex/index.js");
          const providers = getDexProviders();
          const provider = providers.find((p: any) => p.name === cfg.ROUTER_TYPE && typeof p.buildBuyCalldata === "function");
          if (provider && provider.buildBuyCalldata) {
            const swap = await provider.buildBuyCalldata(cfg, clients, token, wethAddress, wallet, spendEth);
            if (swap) {
              const txHash = await clients.walletClient!.sendTransaction({
                to: swap.to as Address,
                data: swap.calldata,
                value: swap.value,
                account: wallet,
                chain: undefined
              });
              logger.info(`${provider.name}_buy_submitted`, { txHash, spendEth: spendEth.toString() });
              return txHash;
            }
          }
        } catch (e) {
          // Fall through to local Aerodrome implementation on any adapter error
        }

        // Read pool to calculate output
        const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
        if (!pool) {
          throw new Error("failed to read Aerodrome pool");
        }

        // Determine reserve order
        const token0 = pool.token0.toLowerCase();
        const wethLower = wethAddress.toLowerCase();
        const tokenLower = token.toLowerCase();

        let wethReserve: bigint;
        let internReserve: bigint;

        if (token0 === wethLower) {
          wethReserve = pool.reserve0;
          internReserve = pool.reserve1;
        } else if (token0 === tokenLower) {
          internReserve = pool.reserve0;
          wethReserve = pool.reserve1;
        } else {
          throw new Error("pool tokens don't match WETH and INTERN");
        }

        // Calculate expected output
        const expectedOutput = calculateAerodromeOutput(spendEth, wethReserve, internReserve, cfg.AERODROME_STABLE);
        const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

        logger.info("aerodrome_buy_quote", {
          spendEth: spendEth.toString(),
          expectedOutput: expectedOutput.toString(),
          minOutput: minOutput.toString(),
          slippageBps: cfg.SLIPPAGE_BPS
        });

        // Build swap calldata
        const { calldata, deadline } = buildAerodromeSwapCalldata(
          spendEth,
          minOutput,
          {
            poolAddress,
            stable: cfg.AERODROME_STABLE,
            tokenInAddress: wethAddress,
            tokenOutAddress: token,
            amountIn: spendEth,
            amountOutMinimum: minOutput
          },
          wallet,
          600 // 10 minute deadline
        );

        logger.info("aerodrome_buy_calldata_built", {
          calldata: calldata.slice(0, 20) + "...",
          deadline: deadline.toString()
        });

        // Send transaction via walletClient
        const txHash = await clients.walletClient!.sendTransaction({
          to: routerAddress,
          data: calldata,
          value: spendEth, // Send ETH (WETH will be handled by router)
          account: wallet,
          chain: undefined
        });

        logger.info("aerodrome_buy_submitted", { txHash, spendEth: spendEth.toString() });

        return txHash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("aerodrome_buy_failed", { error: msg });
        throw err;
      }
    },

    async executeSell(sellAmount: bigint): Promise<`0x${string}`> {
      try {
        logger.info("aerodrome_sell_start", { sellAmount: sellAmount.toString(), pool: poolAddress });

        // Try provider-driven calldata if available (build calldata before allowance check when possible)
        try {
          const { getDexProviders } = await import("./dex/index.js");
          const providers = getDexProviders();
          const provider = providers.find((p: any) => p.name === cfg.ROUTER_TYPE && typeof p.buildSellCalldata === "function");
          if (provider && provider.buildSellCalldata) {
            const swap = await provider.buildSellCalldata(cfg, clients, token, wethAddress, wallet, sellAmount);
            if (swap) {
              // If provider returns calldata, ensure allowance then submit
              try {
                const allowanceResult = await ensureAllowance(
                  clients.publicClient,
                  clients.walletClient,
                  token,
                  wallet,
                  swap.to as Address,
                  sellAmount,
                  cfg.APPROVE_MAX
                );

                if (allowanceResult.didApprove) {
                  logger.info("dex_sell_approval_sent", { approveTxHash: allowanceResult.approveTxHash, tokenAmount: sellAmount.toString() });
                }
              } catch (err) {
                throw err;
              }

              const txHash = await clients.walletClient!.sendTransaction({
                to: swap.to as Address,
                data: swap.calldata,
                account: wallet,
                chain: undefined
              });

              logger.info(`${provider.name}_sell_submitted`, { txHash, sellAmount: sellAmount.toString() });
              return txHash;
            }
          }
        } catch (e) {
          // Fall through to local Aerodrome implementation on any adapter error
        }

        // ============================================================
        // ENSURE ALLOWANCE (NEW)
        // ============================================================
        try {
          const allowanceResult = await ensureAllowance(
            clients.publicClient,
            clients.walletClient,
            token,
            wallet,
            routerAddress,
            sellAmount,
            cfg.APPROVE_MAX
          );

          if (allowanceResult.didApprove) {
            logger.info("aerodrome_sell_approval_sent", {
              approveTxHash: allowanceResult.approveTxHash,
              tokenAmount: sellAmount.toString()
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("aerodrome_sell_approval_failed", { error: msg, sellAmount: sellAmount.toString() });
          throw err;
        }

        // Read pool to calculate output
        const pool = await readAerodromePool(clients, poolAddress, cfg.AERODROME_STABLE);
        if (!pool) {
          throw new Error("failed to read Aerodrome pool");
        }

        // Determine reserve order
        const token0 = pool.token0.toLowerCase();
        const wethLower = wethAddress.toLowerCase();
        const tokenLower = token.toLowerCase();

        let wethReserve: bigint;
        let internReserve: bigint;

        if (token0 === wethLower) {
          wethReserve = pool.reserve0;
          internReserve = pool.reserve1;
        } else if (token0 === tokenLower) {
          internReserve = pool.reserve0;
          wethReserve = pool.reserve1;
        } else {
          throw new Error("pool tokens don't match WETH and INTERN");
        }

        // Calculate expected ETH output
        const expectedOutput = calculateAerodromeOutput(sellAmount, internReserve, wethReserve, cfg.AERODROME_STABLE);
        const minOutput = applySlippage(expectedOutput, cfg.SLIPPAGE_BPS);

        logger.info("aerodrome_sell_quote", {
          sellAmount: sellAmount.toString(),
          expectedOutput: expectedOutput.toString(),
          minOutput: minOutput.toString(),
          slippageBps: cfg.SLIPPAGE_BPS
        });

        // Build swap calldata
        const { calldata, deadline } = buildAerodromeSwapCalldata(
          sellAmount,
          minOutput,
          {
            poolAddress,
            stable: cfg.AERODROME_STABLE,
            tokenInAddress: token,
            tokenOutAddress: wethAddress,
            amountIn: sellAmount,
            amountOutMinimum: minOutput
          },
          wallet,
          600 // 10 minute deadline
        );

        logger.info("aerodrome_sell_calldata_built", {
          calldata: calldata.slice(0, 20) + "...",
          deadline: deadline.toString()
        });

        // Send transaction via walletClient
        const txHash = await clients.walletClient!.sendTransaction({
          to: routerAddress,
          data: calldata,
          account: wallet,
          chain: undefined
        });

        logger.info("aerodrome_sell_submitted", { txHash, sellAmount: sellAmount.toString() });

        return txHash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("aerodrome_sell_failed", { error: msg });
        throw err;
      }
    }
  };
}


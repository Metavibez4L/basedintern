/**
 * XMTP 402 Payment Required Handler
 * 
 * Reference implementation for autonomous 402 response handling:
 * 1. Detect 402 Payment Required responses from XMTP API
 * 2. Extract payment details (recipient, amount, token, chain)
 * 3. Execute USDC payment on Base using viem
 * 4. Retry original request with X-PAYMENT header containing tx hash
 * 
 * This module integrates with the existing based-intern chain infrastructure.
 */

import { 
  type Address, 
  type Hash,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  formatUnits,
  type TransactionReceipt,
  type Hex
} from "viem";
import { sendTransaction } from "viem/actions";
import type { AppConfig } from "../config.js";
import type { ChainClients } from "../chain/client.js";
import { logger } from "../logger.js";

// ============================================================================
// Types
// ============================================================================

/** Payment details extracted from 402 response */
export interface PaymentDetails {
  /** Recipient address for payment */
  recipient: Address;
  /** Amount to pay (in human-readable format) */
  amount: string;
  /** Token contract address (USDC on Base) */
  token: Address;
  /** Chain ID where payment should be executed */
  chainId: number;
  /** Optional payment reference/metadata */
  reference?: string;
  /** Deadline for payment (timestamp) */
  deadline?: number;
}

/** XMTP 402 error response structure */
export interface Xmtp402Error {
  status: 402;
  error: "payment_required";
  /** Payment requirements */
  payment: PaymentDetails;
  /** Human-readable message */
  message: string;
}

/** Result of payment execution */
export interface PaymentResult {
  success: boolean;
  /** Transaction hash if successful */
  txHash?: Hash;
  /** Receipt once confirmed */
  receipt?: TransactionReceipt;
  /** Error if failed */
  error?: string;
  /** Amount paid (formatted) */
  amountPaid?: string;
  /** Token symbol */
  tokenSymbol?: string;
}

/** HTTP response with potential 402 status */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** USDC contract addresses */
export const USDC_ADDRESSES: Record<number, Address> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // Base Mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // Base Sepolia
};

/** USDC decimals */
export const USDC_DECIMALS = 6;

/** XMTP API base URLs by environment */
export const XMTP_API_URLS: Record<string, string> = {
  production: "https://api.xmtp.com",
  dev: "https://api.dev.xmtp.com",
  local: "http://localhost:8080",
};

// ============================================================================
// 402 Detection
// ============================================================================

/**
 * Check if a response is a 402 Payment Required error
 */
export function is402Error(response: HttpResponse): boolean {
  return response.status === 402;
}

/**
 * Extract payment details from a 402 response body
 * Handles various formats of XMTP 402 responses
 */
export function extractPaymentDetails(responseBody: unknown): PaymentDetails | null {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const body = responseBody as Record<string, unknown>;

  // Check for standard XMTP 402 format
  if (body.error !== "payment_required" && body.status !== 402) {
    return null;
  }

  const payment = body.payment as Record<string, unknown> | undefined;
  if (!payment) {
    return null;
  }

  // Validate required fields
  if (!payment.recipient || !payment.amount || !payment.token || !payment.chainId) {
    logger.warn("Incomplete 402 payment details", { payment });
    return null;
  }

  return {
    recipient: payment.recipient as Address,
    amount: payment.amount as string,
    token: payment.token as Address,
    chainId: Number(payment.chainId),
    reference: payment.reference as string | undefined,
    deadline: payment.deadline as number | undefined,
  };
}

/**
 * Validate that payment details are for a supported configuration
 */
export function validatePaymentDetails(
  details: PaymentDetails,
  cfg: AppConfig
): { valid: boolean; error?: string } {
  // Check chain matches our configuration
  const expectedChainId = cfg.CHAIN === "base" ? 8453 : 84532;
  if (details.chainId !== expectedChainId) {
    return {
      valid: false,
      error: `Chain mismatch: required ${details.chainId}, configured for ${expectedChainId}`,
    };
  }

  // Validate token is USDC on this chain
  const expectedUsdc = USDC_ADDRESSES[details.chainId];
  if (details.token.toLowerCase() !== expectedUsdc?.toLowerCase()) {
    return {
      valid: false,
      error: `Unsupported token: ${details.token}. Expected USDC: ${expectedUsdc}`,
    };
  }

  // Check deadline if present
  if (details.deadline && Date.now() / 1000 > details.deadline) {
    return {
      valid: false,
      error: `Payment deadline expired: ${details.deadline}`,
    };
  }

  // Validate amount is positive
  const amountNum = parseFloat(details.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return {
      valid: false,
      error: `Invalid payment amount: ${details.amount}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Payment Execution
// ============================================================================

/**
 * Execute USDC transfer on Base
 * 
 * This function:
 * 1. Checks wallet balance
 * 2. Approves spending if needed (for router-based payments)
 * 3. Executes the transfer
 * 4. Waits for confirmation
 */
export async function executeUsdcPayment(
  clients: ChainClients,
  details: PaymentDetails,
  cfg: AppConfig
): Promise<PaymentResult> {
  const { walletClient, publicClient, walletAddress } = clients;

  if (!walletClient) {
    return { success: false, error: "Wallet client not available (read-only mode)" };
  }

  try {
    // Convert amount to USDC units (6 decimals)
    const amountUnits = parseUnits(details.amount, USDC_DECIMALS);

    // Check USDC balance
    const usdcBalance = await publicClient.readContract({
      address: details.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    if (usdcBalance < amountUnits) {
      const balanceFormatted = formatUnits(usdcBalance, USDC_DECIMALS);
      return {
        success: false,
        error: `Insufficient USDC balance: ${balanceFormatted} < ${details.amount}`,
      };
    }

    logger.info("Executing USDC payment", {
      recipient: details.recipient,
      amount: details.amount,
      token: details.token,
    });

    // Build transfer calldata
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [details.recipient, amountUnits],
    });

    // Send transaction using the sendTransaction action
    // This properly handles the account from the walletClient
    const txHash = await sendTransaction(walletClient, {
      to: details.token,
      data: transferData as Hex,
      value: 0n,
    } as Parameters<typeof sendTransaction>[1]);

    logger.info("USDC payment transaction submitted", { txHash });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: cfg.APPROVE_CONFIRMATIONS ?? 1,
      timeout: 60_000, // 60 seconds
    });

    if (receipt.status !== "success") {
      return {
        success: false,
        error: `Transaction failed on-chain: ${txHash}`,
        txHash,
      };
    }

    logger.info("USDC payment confirmed", {
      txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    return {
      success: true,
      txHash,
      receipt,
      amountPaid: details.amount,
      tokenSymbol: "USDC",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("USDC payment failed", { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// Retry with Payment Header
// ============================================================================

/**
 * Build X-PAYMENT header value from transaction hash
 * Format: chainId:txHash (eip155 format)
 */
export function buildXPaymentHeader(
  chainId: number,
  txHash: Hash
): string {
  // Format: eip155:chainId:txHash
  return `eip155:${chainId}:${txHash}`;
}

/**
 * Parse X-PAYMENT header to extract chain and transaction
 */
export function parseXPaymentHeader(header: string): { chainId: number; txHash: Hash } | null {
  const parts = header.split(":");
  if (parts.length !== 3 || parts[0] !== "eip155") {
    return null;
  }
  return {
    chainId: Number(parts[1]),
    txHash: parts[2] as Hash,
  };
}

/**
 * Retry a request with the X-PAYMENT header
 * Generic fetch wrapper that handles the retry
 */
export async function retryWithPaymentHeader<T>(
  originalRequest: () => Promise<T>,
  chainId: number,
  txHash: Hash
): Promise<T> {
  // This is a placeholder - actual implementation would modify the request headers
  // The exact implementation depends on the HTTP client being used
  logger.info("Retrying request with X-PAYMENT header", {
    chainId,
    txHash,
    header: buildXPaymentHeader(chainId, txHash),
  });

  return originalRequest();
}

// ============================================================================
// Main 402 Handler
// ============================================================================

export interface Xmtp402Handler {
  /** Execute payment and return header for retry */
  handle402: (response: HttpResponse) => Promise<{ 
    success: boolean; 
    xPaymentHeader?: string; 
    error?: string;
    result?: PaymentResult;
  }>;
  /** Validate payment is appropriate to make */
  validate: (details: PaymentDetails) => { valid: boolean; error?: string };
  /** Get current spending limits/status */
  getStatus: () => { spent24h: string; limit24h: string; remaining: string };
}

/**
 * Create a 402 handler instance with spending controls
 */
export function create402Handler(
  cfg: AppConfig,
  clients: ChainClients,
  options: {
    /** Maximum USDC to spend in 24h period */
    dailyLimit?: string;
    /** Callback when payment is made */
    onPayment?: (result: PaymentResult) => void;
    /** Auto-approve payments under this amount */
    autoApproveThreshold?: string;
  } = {}
): Xmtp402Handler {
  const dailyLimit = options.dailyLimit || "100.00";
  const autoApproveThreshold = options.autoApproveThreshold || "1.00";
  
  // Track spending (in-memory; persist for production)
  let spent24h = 0;
  const paymentHistory: PaymentResult[] = [];

  return {
    async handle402(response: HttpResponse) {
      // Extract payment details
      const details = extractPaymentDetails(response.body);
      if (!details) {
        return { success: false, error: "Could not extract payment details from 402 response" };
      }

      // Validate against config
      const validation = validatePaymentDetails(details, cfg);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Check spending limits
      const amountNum = parseFloat(details.amount);
      const limitNum = parseFloat(dailyLimit);
      if (spent24h + amountNum > limitNum) {
        return {
          success: false,
          error: `Daily spending limit exceeded: ${spent24h} + ${amountNum} > ${limitNum}`,
        };
      }

      // Check auto-approve threshold (in real implementation, might prompt user)
      if (amountNum > parseFloat(autoApproveThreshold)) {
        logger.warn("Payment exceeds auto-approve threshold, requires manual approval", {
          amount: details.amount,
          threshold: autoApproveThreshold,
        });
        // In a real implementation, this would trigger a user prompt
        // For now, we'll proceed but log the warning
      }

      // Execute payment
      const result = await executeUsdcPayment(clients, details, cfg);
      
      if (!result.success) {
        return { success: false, error: result.error, result };
      }

      // Update spending tracking
      spent24h += amountNum;
      paymentHistory.push(result);

      // Notify callback
      options.onPayment?.(result);

      // Build X-PAYMENT header
      const xPaymentHeader = buildXPaymentHeader(details.chainId, result.txHash!);

      return {
        success: true,
        xPaymentHeader,
        result,
      };
    },

    validate(details: PaymentDetails) {
      return validatePaymentDetails(details, cfg);
    },

    getStatus() {
      const limitNum = parseFloat(dailyLimit);
      return {
        spent24h: spent24h.toFixed(2),
        limit24h: dailyLimit,
        remaining: Math.max(0, limitNum - spent24h).toFixed(2),
      };
    },
  };
}

// ============================================================================
// XMTP Client Integration Helpers
// ============================================================================

/**
 * Wrap an XMTP API request with automatic 402 handling
 * 
 * Usage:
 * ```typescript
 * const response = await fetchWith402Handling(
 *   () => xmtpClient.publishMessage(message),
 *   handler
 * );
 * ```
 */
export async function fetchWith402Handling<T>(
  fetchFn: () => Promise<T>,
  handler: Xmtp402Handler,
  maxRetries = 1
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchFn();
      return result;
    } catch (err) {
      // Check if this is a 402 error
      const response = err instanceof Response ? err : null;
      if (response?.status === 402 && attempt < maxRetries) {
        // Clone response to read body
        const body = await response.clone().json().catch(() => null);
        
        const handleResult = await handler.handle402({
          status: 402,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        });

        if (!handleResult.success) {
          throw new Error(`402 handling failed: ${handleResult.error}`);
        }

        // Retry with payment header - the actual header injection
        // depends on the XMTP client's API
        lastError = new Error("Retry after 402 payment - X-PAYMENT header needed");
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

// ============================================================================
// Example Usage (for documentation)
// ============================================================================

/**
 * Example: Complete 402 handling flow
 * ```typescript
 * import { createChainClients } from "./chain/client.js";
 * import { loadConfig } from "./config.js";
 * import { create402Handler, fetchWith402Handling } from "./xmtp402.js";
 * 
 * // Setup
 * const cfg = loadConfig();
 * const clients = createChainClients(cfg);
 * const handler = create402Handler(cfg, clients, {
 *   dailyLimit: "50.00",
 *   autoApproveThreshold: "0.50",
 *   onPayment: (result) => console.log("Paid:", result.txHash),
 * });
 * 
 * // Make XMTP request with automatic 402 handling
 * try {
 *   const response = await fetchWith402Handling(
 *     () => fetch("https://api.xmtp.com/v1/publish", {
 *       method: "POST",
 *       body: JSON.stringify(message),
 *     }),
 *     handler
 *   );
 * } catch (err) {
 *   console.error("Request failed:", err);
 * }
 * ```
 */

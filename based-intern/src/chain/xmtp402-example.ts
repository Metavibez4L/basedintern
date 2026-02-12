/**
 * XMTP 402 Integration Example
 * 
 * This file demonstrates a complete integration of the 402 handler with
 * a hypothetical XMTP client. It shows the full flow from message sending
 * through 402 detection, payment, and retry.
 */

import { type Hash, type Address } from "viem";
import { loadConfig } from "../config.js";
import { createChainClients } from "./client.js";
import {
  create402Handler,
  buildXPaymentHeader,
  type PaymentResult,
  type Xmtp402Handler,
} from "./xmtp402.js";
import { logger } from "../logger.js";

// ============================================================================
// Types
// ============================================================================

interface XmtpMessage {
  recipient: Address;
  content: string;
  contentType?: string;
}

interface XmtpPublishResponse {
  messageId: string;
  timestamp: string;
}

interface Xmtp402ClientOptions {
  /** XMTP API base URL */
  apiUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Daily USDC spending limit (default: "50.00") */
  dailyLimit?: string;
  /** Auto-approve threshold in USDC (default: "1.00") */
  autoApproveThreshold?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  paymentTxHash?: Hash;
  paymentAmount?: string;
  error?: string;
}

// ============================================================================
// XMTP 402 Client
// ============================================================================

export class Xmtp402Client {
  private handler: Xmtp402Handler;
  private apiUrl: string;
  private apiKey?: string;
  private paymentHistory: PaymentResult[] = [];

  constructor(
    handler: Xmtp402Handler,
    options: Xmtp402ClientOptions = {}
  ) {
    this.handler = handler;
    this.apiUrl = options.apiUrl || "https://api.xmtp.com";
    this.apiKey = options.apiKey;
  }

  /**
   * Send a message via XMTP with automatic 402 handling
   */
  async sendMessage(message: XmtpMessage): Promise<SendResult> {
    try {
      // First attempt
      const result = await this.tryPublish(message);
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (err) {
      // Check if this is a 402 error
      if (err instanceof Xmtp402Error) {
        return this.handle402AndRetry(message, err);
      }
      
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get payment statistics
   */
  getPaymentStats() {
    const totalPaid = this.paymentHistory.reduce(
      (sum, p) => sum + parseFloat(p.amountPaid || "0"),
      0
    );
    
    return {
      totalPayments: this.paymentHistory.length,
      totalPaidUsdc: totalPaid.toFixed(2),
      status: this.handler.getStatus(),
    };
  }

  /**
   * Attempt to publish message to XMTP
   */
  private async tryPublish(message: XmtpMessage): Promise<XmtpPublishResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiUrl}/v1/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (response.status === 402) {
      const body = await response.json();
      throw new Xmtp402Error(body);
    }

    if (!response.ok) {
      throw new Error(`XMTP API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Handle 402 error: pay and retry
   */
  private async handle402AndRetry(
    message: XmtpMessage,
    error: Xmtp402Error
  ): Promise<SendResult> {
    logger.info("402 Payment Required - initiating payment", {
      recipient: error.paymentDetails.recipient,
      amount: error.paymentDetails.amount,
    });

    // Execute payment via handler
    const handleResult = await this.handler.handle402({
      status: 402,
      headers: {},
      body: {
        status: 402,
        error: "payment_required",
        payment: error.paymentDetails,
      },
    });

    if (!handleResult.success) {
      return {
        success: false,
        error: `Payment failed: ${handleResult.error}`,
      };
    }

    // Store payment history
    if (handleResult.result) {
      this.paymentHistory.push(handleResult.result);
    }

    logger.info("Payment successful, retrying with X-PAYMENT header", {
      txHash: handleResult.result?.txHash,
    });

    // Retry with X-PAYMENT header
    try {
      const result = await this.tryPublishWithPayment(
        message,
        handleResult.xPaymentHeader!
      );

      return {
        success: true,
        messageId: result.messageId,
        paymentTxHash: handleResult.result?.txHash,
        paymentAmount: handleResult.result?.amountPaid,
      };
    } catch (retryErr) {
      return {
        success: false,
        paymentTxHash: handleResult.result?.txHash,
        paymentAmount: handleResult.result?.amountPaid,
        error: retryErr instanceof Error 
          ? `Retry failed: ${retryErr.message}` 
          : "Retry failed",
      };
    }
  }

  /**
   * Retry publish with X-PAYMENT header
   */
  private async tryPublishWithPayment(
    message: XmtpMessage,
    xPaymentHeader: string
  ): Promise<XmtpPublishResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-PAYMENT": xPaymentHeader,
    };
    
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiUrl}/v1/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`XMTP API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Custom error class for XMTP 402 responses
 */
class Xmtp402Error extends Error {
  paymentDetails: {
    recipient: Address;
    amount: string;
    token: Address;
    chainId: number;
    reference?: string;
    deadline?: number;
  };

  constructor(body: {
    payment: {
      recipient: Address;
      amount: string;
      token: Address;
      chainId: number;
      reference?: string;
      deadline?: number;
    };
  }) {
    super("Payment required");
    this.name = "Xmtp402Error";
    this.paymentDetails = body.payment;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a fully configured XMTP client with 402 handling
 * 
 * Usage:
 * ```typescript
 * const client = await createXmtp402Client({
 *   dailyLimit: "100.00",
 *   autoApproveThreshold: "5.00",
 * });
 * 
 * const result = await client.sendMessage({
 *   recipient: "0x...",
 *   content: "Hello!",
 * });
 * ```
 */
export async function createXmtp402Client(
  options: Xmtp402ClientOptions = {}
): Promise<Xmtp402Client> {
  // Load configuration
  const cfg = loadConfig();
  
  // Initialize chain clients
  const clients = createChainClients(cfg);
  
  // Verify wallet is available
  if (!clients.walletClient) {
    throw new Error("Wallet client not available. Check PRIVATE_KEY configuration.");
  }

  // Create 402 handler
  const handler = create402Handler(cfg, clients, {
    dailyLimit: options.dailyLimit,
    autoApproveThreshold: options.autoApproveThreshold,
    onPayment: (result) => {
      logger.info("402 payment executed", {
        txHash: result.txHash,
        amount: result.amountPaid,
        token: result.tokenSymbol,
      });
    },
  });

  // Create client
  const client = new Xmtp402Client(handler, {
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    dailyLimit: options.dailyLimit,
    autoApproveThreshold: options.autoApproveThreshold,
  });

  logger.info("XMTP 402 client initialized", {
    apiUrl: options.apiUrl || "https://api.xmtp.com",
    chain: cfg.CHAIN,
    wallet: clients.walletAddress,
  });

  return client;
}

// ============================================================================
// CLI Example
// ============================================================================

/**
 * Example CLI usage
 * 
 * Run with:
 * ```bash
 * tsx src/chain/xmtp402-example.ts send \
 *   --recipient 0x... \
 *   --message "Hello, XMTP!" \
 *   --daily-limit 50.00
 * ```
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === "send") {
    // Parse arguments
    const recipientIndex = args.indexOf("--recipient");
    const messageIndex = args.indexOf("--message");
    const limitIndex = args.indexOf("--daily-limit");
    
    if (recipientIndex === -1 || messageIndex === -1) {
      console.error("Usage: tsx xmtp402-example.ts send --recipient 0x... --message 'Hello!'");
      process.exit(1);
    }
    
    const recipient = args[recipientIndex + 1] as Address;
    const message = args[messageIndex + 1];
    const dailyLimit = limitIndex !== -1 ? args[limitIndex + 1] : "50.00";
    
    try {
      const client = await createXmtp402Client({ dailyLimit });
      
      console.log(`Sending message to ${recipient}...`);
      const result = await client.sendMessage({ recipient, content: message });
      
      if (result.success) {
        console.log("✓ Message sent successfully!");
        console.log(`  Message ID: ${result.messageId}`);
        if (result.paymentTxHash) {
          console.log(`  Payment: ${result.paymentAmount} USDC`);
          console.log(`  Tx Hash: ${result.paymentTxHash}`);
        }
      } else {
        console.error("✗ Failed to send message");
        console.error(`  Error: ${result.error}`);
        process.exit(1);
      }
      
      // Show stats
      const stats = client.getPaymentStats();
      console.log("\nPayment Stats:");
      console.log(`  Total payments: ${stats.totalPayments}`);
      console.log(`  Total spent: ${stats.totalPaidUsdc} USDC`);
      console.log(`  Daily remaining: ${stats.status.remaining} USDC`);
      
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  } else {
    console.log("XMTP 402 Client Example");
    console.log("");
    console.log("Commands:");
    console.log("  send --recipient 0x... --message 'Hello!' [--daily-limit 50.00]");
    console.log("");
    console.log("Environment variables:");
    console.log("  PRIVATE_KEY - Wallet private key (required)");
    console.log("  RPC_URL - Base L2 RPC endpoint (required)");
    console.log("  CHAIN - 'base' or 'base-sepolia' (default: base)");
    console.log("  XMTP_API_KEY - API key for XMTP (optional)");
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

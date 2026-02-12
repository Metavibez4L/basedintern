import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  is402Error,
  extractPaymentDetails,
  validatePaymentDetails,
  buildXPaymentHeader,
  parseXPaymentHeader,
  create402Handler,
  USDC_ADDRESSES,
  type PaymentDetails,
  type HttpResponse,
} from "../src/chain/xmtp402.js";
import type { AppConfig } from "../src/config.js";
import type { ChainClients } from "../src/chain/client.js";

// Mock the logger to avoid console noise
vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock viem/actions
const mockSendTransaction = vi.fn();
vi.mock("viem/actions", () => ({
  sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
}));

// Test fixtures
const MOCK_WALLET_ADDRESS = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const MOCK_RECIPIENT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

function makeMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    WALLET_MODE: "private_key",
    PRIVATE_KEY: "0x" + "a".repeat(64),
    CHAIN: "base",
    LOOP_MINUTES: 30,
    DRY_RUN: false,
    TRADING_ENABLED: false,
    KILL_SWITCH: true,
    DAILY_TRADE_CAP: 2,
    MIN_INTERVAL_MINUTES: 60,
    MAX_SPEND_ETH_PER_TRADE: "0.0005",
    SELL_FRACTION_BPS: 500,
    SLIPPAGE_BPS: 300,
    APPROVE_CONFIRMATIONS: 1,
    ROUTER_TYPE: "unknown",
    AERODROME_STABLE: false,
    SOCIAL_MODE: "none",
    SOCIAL_MULTI_TARGETS: "x_api,moltbook",
    X_PHASE1_MENTIONS: false,
    X_POLL_MINUTES: 2,
    ...overrides,
  } as AppConfig;
}

function makeMockClients(overrides: Partial<ChainClients> = {}): ChainClients {
  return {
    publicClient: {
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    } as any,
    walletClient: {} as any, // sendTransaction is mocked from viem/actions
    walletAddress: MOCK_WALLET_ADDRESS,
    ...overrides,
  };
}

describe("XMTP 402 Detection", () => {
  describe("is402Error", () => {
    it("returns true for status 402", () => {
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {},
      };
      expect(is402Error(response)).toBe(true);
    });

    it("returns false for other statuses", () => {
      const response: HttpResponse = {
        status: 200,
        headers: {},
        body: {},
      };
      expect(is402Error(response)).toBe(false);
    });

    it("returns false for 401", () => {
      const response: HttpResponse = {
        status: 401,
        headers: {},
        body: {},
      };
      expect(is402Error(response)).toBe(false);
    });
  });

  describe("extractPaymentDetails", () => {
    it("extracts valid payment details from XMTP 402 response", () => {
      const responseBody = {
        status: 402,
        error: "payment_required",
        message: "Payment required to publish message",
        payment: {
          recipient: MOCK_RECIPIENT,
          amount: "0.50",
          token: USDC_ADDRESSES[8453],
          chainId: 8453,
          reference: "msg_123",
          deadline: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const details = extractPaymentDetails(responseBody);
      expect(details).not.toBeNull();
      expect(details?.recipient).toBe(MOCK_RECIPIENT);
      expect(details?.amount).toBe("0.50");
      expect(details?.token).toBe(USDC_ADDRESSES[8453]);
      expect(details?.chainId).toBe(8453);
      expect(details?.reference).toBe("msg_123");
    });

    it("returns null for non-402 response", () => {
      const responseBody = {
        status: 200,
        data: "success",
      };

      expect(extractPaymentDetails(responseBody)).toBeNull();
    });

    it("returns null for 402 without payment details", () => {
      const responseBody = {
        status: 402,
        error: "payment_required",
        message: "Payment required",
      };

      expect(extractPaymentDetails(responseBody)).toBeNull();
    });

    it("returns null for incomplete payment details", () => {
      const responseBody = {
        status: 402,
        error: "payment_required",
        payment: {
          recipient: MOCK_RECIPIENT,
          // missing amount, token, chainId
        },
      };

      expect(extractPaymentDetails(responseBody)).toBeNull();
    });

    it("handles string chainId from JSON", () => {
      const responseBody = {
        status: 402,
        error: "payment_required",
        payment: {
          recipient: MOCK_RECIPIENT,
          amount: "1.00",
          token: USDC_ADDRESSES[8453],
          chainId: "8453", // String instead of number
        },
      };

      const details = extractPaymentDetails(responseBody);
      expect(details?.chainId).toBe(8453);
    });
  });
});

describe("Payment Validation", () => {
  describe("validatePaymentDetails", () => {
    it("accepts valid payment for Base mainnet config", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts valid payment for Base Sepolia config", () => {
      const cfg = makeMockConfig({ CHAIN: "base-sepolia" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[84532],
        chainId: BASE_SEPOLIA_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(true);
    });

    it("rejects payment on wrong chain", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[84532], // Sepolia USDC
        chainId: BASE_SEPOLIA_CHAIN_ID, // But Base Sepolia chain
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Chain mismatch");
    });

    it("rejects non-USDC token", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: "0x0000000000000000000000000000000000000001" as `0x${string}`,
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported token");
    });

    it("rejects expired deadline", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
        deadline: Math.floor(Date.now() / 1000) - 1, // 1 second ago
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("deadline expired");
    });

    it("accepts future deadline", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(true);
    });

    it("rejects zero amount", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid payment amount");
    });

    it("rejects negative amount", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "-1.00",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
    });

    it("rejects invalid amount string", () => {
      const cfg = makeMockConfig({ CHAIN: "base" });
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "not-a-number",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = validatePaymentDetails(details, cfg);
      expect(result.valid).toBe(false);
    });
  });
});

describe("X-PAYMENT Header", () => {
  describe("buildXPaymentHeader", () => {
    it("builds correct eip155 header", () => {
      const txHash = "0xabc123def456" as `0x${string}`;
      const header = buildXPaymentHeader(8453, txHash);
      expect(header).toBe("eip155:8453:0xabc123def456");
    });

    it("preserves full transaction hash", () => {
      const txHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const header = buildXPaymentHeader(84532, txHash);
      expect(header).toBe(`eip155:84532:${txHash}`);
    });
  });

  describe("parseXPaymentHeader", () => {
    it("parses valid eip155 header", () => {
      const header = "eip155:8453:0xabc123def456";
      const parsed = parseXPaymentHeader(header);
      expect(parsed).not.toBeNull();
      expect(parsed?.chainId).toBe(8453);
      expect(parsed?.txHash).toBe("0xabc123def456");
    });

    it("returns null for invalid format", () => {
      const header = "invalid:header:format:extra";
      expect(parseXPaymentHeader(header)).toBeNull();
    });

    it("returns null for non-eip155 prefix", () => {
      const header = "other:8453:0xabc123";
      expect(parseXPaymentHeader(header)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseXPaymentHeader("")).toBeNull();
    });
  });
});

describe("402 Handler", () => {
  let mockConfig: AppConfig;
  let mockClients: ChainClients;

  beforeEach(() => {
    mockConfig = makeMockConfig({ CHAIN: "base" });
    mockClients = makeMockClients();
    mockSendTransaction.mockClear();
  });

  describe("create402Handler", () => {
    it("creates handler with default options", () => {
      const handler = create402Handler(mockConfig, mockClients);
      expect(handler).toHaveProperty("handle402");
      expect(handler).toHaveProperty("validate");
      expect(handler).toHaveProperty("getStatus");
    });

    it("creates handler with custom options", () => {
      const onPayment = vi.fn();
      const handler = create402Handler(mockConfig, mockClients, {
        dailyLimit: "50.00",
        autoApproveThreshold: "0.10",
        onPayment,
      });
      expect(handler).toBeDefined();
    });
  });

  describe("handler.getStatus", () => {
    it("returns initial status with zero spent", () => {
      const handler = create402Handler(mockConfig, mockClients, { dailyLimit: "100.00" });
      const status = handler.getStatus();
      expect(status.spent24h).toBe("0.00");
      expect(status.limit24h).toBe("100.00");
      expect(status.remaining).toBe("100.00");
    });
  });

  describe("handler.validate", () => {
    it("validates payment details against config", () => {
      const handler = create402Handler(mockConfig, mockClients);
      const details: PaymentDetails = {
        recipient: MOCK_RECIPIENT,
        amount: "0.50",
        token: USDC_ADDRESSES[8453],
        chainId: BASE_MAINNET_CHAIN_ID,
      };

      const result = handler.validate(details);
      expect(result.valid).toBe(true);
    });
  });

  describe("handler.handle402", () => {
    it("handles successful payment flow", async () => {
      // Mock successful transaction
      const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const mockReceipt = {
        status: "success",
        blockNumber: 123456n,
        gasUsed: 50000n,
      };

      mockSendTransaction.mockResolvedValue(mockTxHash);

      const clients = makeMockClients({
        publicClient: {
          readContract: vi.fn().mockResolvedValue(1000000000n), // 1000 USDC
          waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
        } as any,
      });

      const handler = create402Handler(mockConfig, clients, { dailyLimit: "100.00" });
      
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "0.50",
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      const result = await handler.handle402(response);
      
      expect(result.success).toBe(true);
      expect(result.xPaymentHeader).toBe(`eip155:8453:${mockTxHash}`);
      expect(result.result?.txHash).toBe(mockTxHash);
    });

    it("fails when payment details cannot be extracted", async () => {
      const handler = create402Handler(mockConfig, mockClients);
      
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: { error: "payment_required" }, // No payment details
      };

      const result = await handler.handle402(response);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not extract payment details");
    });

    it("fails when chain mismatch", async () => {
      const cfg = makeMockConfig({ CHAIN: "base-sepolia" }); // Sepolia config
      const handler = create402Handler(cfg, mockClients);
      
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "0.50",
            token: USDC_ADDRESSES[8453], // Mainnet USDC
            chainId: BASE_MAINNET_CHAIN_ID, // Mainnet chain
          },
        },
      };

      const result = await handler.handle402(response);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("Chain mismatch");
    });

    it("fails when daily limit would be exceeded", async () => {
      const handler = create402Handler(mockConfig, mockClients, { dailyLimit: "0.10" });
      
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "0.50", // Exceeds 0.10 limit
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      const result = await handler.handle402(response);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("Daily spending limit exceeded");
    });

    it("fails when wallet client is unavailable", async () => {
      const clients = makeMockClients({
        walletClient: null, // Read-only mode
      });

      const handler = create402Handler(mockConfig, clients);
      
      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "0.50",
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      const result = await handler.handle402(response);
      
      expect(result.success).toBe(false);
      expect(result.result?.error).toContain("Wallet client not available");
    });

    it("tracks spending across multiple payments", async () => {
      const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const mockReceipt = {
        status: "success",
        blockNumber: 123456n,
        gasUsed: 50000n,
      };

      mockSendTransaction.mockResolvedValue(mockTxHash);

      const clients = makeMockClients({
        publicClient: {
          readContract: vi.fn().mockResolvedValue(1000000000n),
          waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
        } as any,
      });

      const handler = create402Handler(mockConfig, clients, { dailyLimit: "10.00" });

      // First payment
      const response1: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "2.00",
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      await handler.handle402(response1);
      
      let status = handler.getStatus();
      expect(status.spent24h).toBe("2.00");
      expect(status.remaining).toBe("8.00");

      // Second payment
      const response2: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "3.50",
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      await handler.handle402(response2);
      
      status = handler.getStatus();
      expect(status.spent24h).toBe("5.50");
      expect(status.remaining).toBe("4.50");
    });

    it("calls onPayment callback when payment succeeds", async () => {
      const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      const mockReceipt = {
        status: "success",
        blockNumber: 123456n,
        gasUsed: 50000n,
      };

      mockSendTransaction.mockResolvedValue(mockTxHash);

      const clients = makeMockClients({
        publicClient: {
          readContract: vi.fn().mockResolvedValue(1000000000n),
          waitForTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
        } as any,
      });

      const onPayment = vi.fn();
      const handler = create402Handler(mockConfig, clients, { onPayment });

      const response: HttpResponse = {
        status: 402,
        headers: {},
        body: {
          status: 402,
          error: "payment_required",
          payment: {
            recipient: MOCK_RECIPIENT,
            amount: "0.50",
            token: USDC_ADDRESSES[8453],
            chainId: BASE_MAINNET_CHAIN_ID,
          },
        },
      };

      await handler.handle402(response);

      expect(onPayment).toHaveBeenCalledOnce();
      expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        txHash: mockTxHash,
        amountPaid: "0.50",
        tokenSymbol: "USDC",
      }));
    });
  });
});

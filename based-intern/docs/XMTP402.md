# XMTP 402 Payment Handler

Autonomous 402 Payment Required response handler for XMTP agents. Detects payment requirements, executes USDC transfers on Base, and retries requests with payment proofs.

## Overview

This module provides a complete reference implementation for handling XMTP's 402 (Payment Required) responses:

1. **Detection**: Identifies 402 responses from XMTP API endpoints
2. **Extraction**: Parses payment details (recipient, amount, token, chain)
3. **Validation**: Verifies chain/token compatibility with agent configuration
4. **Execution**: Performs USDC transfers on Base L2 using viem
5. **Retry**: Generates `X-PAYMENT` headers for authenticated retries

## Quick Start

```typescript
import { loadConfig } from "./config.js";
import { createChainClients } from "./chain/client.js";
import { create402Handler, fetchWith402Handling } from "./chain/xmtp402.js";

// Initialize
const cfg = loadConfig();
const clients = createChainClients(cfg);
const handler = create402Handler(cfg, clients, {
  dailyLimit: "50.00",           // Max USDC/day
  autoApproveThreshold: "1.00",  // Auto-pay under $1
  onPayment: (result) => console.log("Paid:", result.txHash),
});

// Use with automatic 402 handling
try {
  const response = await fetchWith402Handling(
    () => xmtpApi.publishMessage(message),
    handler
  );
} catch (err) {
  console.error("Request failed:", err);
}
```

## API Reference

### `create402Handler(cfg, clients, options)`

Creates a configured handler instance with spending controls.

**Parameters:**
- `cfg: AppConfig` - Application configuration
- `clients: ChainClients` - Viem public/wallet clients
- `options`:
  - `dailyLimit?: string` - Maximum USDC to spend in 24h (default: "100.00")
  - `autoApproveThreshold?: string` - Auto-approve payments under this amount (default: "1.00")
  - `onPayment?: (result: PaymentResult) => void` - Callback on successful payment

**Returns:** `Xmtp402Handler`

### Handler Methods

#### `handler.handle402(response)`

Processes a 402 response and executes payment if valid.

```typescript
const result = await handler.handle402({
  status: 402,
  headers: {},
  body: {
    status: 402,
    error: "payment_required",
    payment: {
      recipient: "0x...",
      amount: "0.50",
      token: "0x8335...", // USDC on Base
      chainId: 8453,
    }
  }
});

if (result.success) {
  console.log("X-PAYMENT header:", result.xPaymentHeader);
  // eip155:8453:0x...
}
```

#### `handler.validate(details)`

Pre-validates payment details without executing.

```typescript
const validation = handler.validate(paymentDetails);
if (!validation.valid) {
  console.error(validation.error); // "Chain mismatch", etc.
}
```

#### `handler.getStatus()`

Returns current spending status.

```typescript
const status = handler.getStatus();
// { spent24h: "5.50", limit24h: "50.00", remaining: "44.50" }
```

### Utility Functions

#### `extractPaymentDetails(body)`

Extracts payment requirements from a 402 response body.

#### `validatePaymentDetails(details, cfg)`

Validates that payment details match the agent's configuration (chain, token).

#### `buildXPaymentHeader(chainId, txHash)` / `parseXPaymentHeader(header)`

Create and parse EIP-155 formatted payment headers.

```typescript
const header = buildXPaymentHeader(8453, txHash);
// "eip155:8453:0x..."

const parsed = parseXPaymentHeader(header);
// { chainId: 8453, txHash: "0x..." }
```

## Integration Example

See `src/chain/xmtp402-example.ts` for a complete working example:

```typescript
import { createXmtp402Client } from "./xmtp402-example.js";

const client = await createXmtp402Client();

// Send a message - payment is handled automatically if required
const result = await client.sendMessage({
  recipient: "0x...",
  content: "Hello, world!",
});

console.log("Message sent, payment tx:", result.paymentTxHash);
```

## Configuration

### Environment Variables

```bash
# Required
PRIVATE_KEY=0x...                    # Agent wallet private key
RPC_URL=https://mainnet.base.org     # Base L2 RPC endpoint
CHAIN=base                           # "base" or "base-sepolia"

# Optional
XMTP_API_URL=https://api.xmtp.com    # XMTP API endpoint
USDC_ADDRESS=0x8335...               # USDC contract (auto-set for chain)
```

### Supported Chains

| Chain ID | Network | USDC Address |
|----------|---------|--------------|
| 8453 | Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| 84532 | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Security Considerations

1. **Spending Limits**: Always set `dailyLimit` to prevent runaway payments
2. **Auto-Approve Threshold**: Review payments above threshold before confirming
3. **Chain Validation**: Handler validates chain matches configuration
4. **Token Validation**: Only USDC on configured chain is accepted
5. **Deadline Checking**: Expired payment requirements are rejected

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    XMTP API Request                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               402 Payment Required?                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Response Body:                                       │  │
│  │  {                                                    │  │
│  │    status: 402,                                       │  │
│  │    error: "payment_required",                         │  │
│  │    payment: {                                         │  │
│  │      recipient: "0x...",                              │  │
│  │      amount: "0.50",                                  │  │
│  │      token: "0x8335...", // USDC                      │  │
│  │      chainId: 8453                                    │  │
│  │    }                                                  │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Payment Validation                             │
│  • Chain matches configuration                              │
│  • Token is USDC on correct chain                           │
│  • Amount is positive and within daily limit                │
│  • Deadline has not expired                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              USDC Transfer Execution                        │
│  • Check USDC balance                                       │
│  • Encode transfer calldata                                 │
│  • Submit transaction via viem                              │
│  • Wait for confirmation (default: 1 block)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Retry with X-PAYMENT Header                    │
│  X-PAYMENT: eip155:8453:0x...                              │
└─────────────────────────────────────────────────────────────┘
```

## Testing

```bash
# Run 402 handler tests
npm test -- tests/xmtp402.test.ts

# Run all tests
npm test
```

## License

MIT - See LICENSE for details

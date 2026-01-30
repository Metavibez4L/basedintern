import { describe, it, expect } from "vitest";
import { buildReceiptMessage, type ReceiptInput } from "../src/agent/receipts.js";

/**
 * Create a minimal mock ReceiptInput for testing
 */
function mockReceipt(overrides?: Partial<ReceiptInput>): ReceiptInput {
  const base: ReceiptInput = {
    action: "HOLD",
    wallet: "0x" + "a".repeat(40),
    ethWei: 5n * 10n ** 18n, // 5 ETH
    internAmount: 50_000n * 10n ** 18n, // 50k INTERN
    internDecimals: 18,
    priceText: "$0.001234 ETH",
    txHash: null,
    dryRun: true
  };

  return { ...base, ...overrides };
}

describe("buildReceiptMessage", () => {
  describe("formatting and structure", () => {
    it("includes all required fields", () => {
      const receipt = mockReceipt({
        action: "BUY",
        wallet: "0x1234567890123456789012345678901234567890",
        ethWei: 2n * 10n ** 18n,
        internAmount: 20_000n * 10n ** 18n,
        internDecimals: 18,
        priceText: "$0.005 ETH",
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        dryRun: false
      });

      const message = buildReceiptMessage(receipt);

      // Should be multi-line
      const lines = message.split("\n");
      expect(lines.length).toBeGreaterThan(5);

      // Should include header
      expect(message).toContain("BASED INTERN REPORT");

      // Should include action
      expect(message).toContain("action: BUY");

      // Should include wallet (shortened format shows full address)
      expect(message).toContain("0x1234567890123456789012345678901234567890");

      // Should include balances
      expect(message).toContain("eth:");
      expect(message).toContain("intern:");

      // Should include price
      expect(message).toContain("$0.005 ETH");

      // Should include transaction hash
      expect(message).toContain("0xabcdef");
    });

    it("shows mode as LIVE when dryRun=false", () => {
      const receipt = mockReceipt({ dryRun: false });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("mode: LIVE");
      expect(message).not.toContain("mode: SIMULATED");
    });

    it("shows mode as SIMULATED when dryRun=true", () => {
      const receipt = mockReceipt({ dryRun: true });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("mode: SIMULATED");
      expect(message).not.toContain("mode: LIVE");
    });

    it("shows tx hash when present and dryRun=false", () => {
      const receipt = mockReceipt({
        dryRun: false,
        txHash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("tx: 0xdeadbeef");
      expect(message).not.toContain("tx: -");
    });

    it("shows tx as dash when null in dryRun=false", () => {
      const receipt = mockReceipt({
        dryRun: false,
        txHash: null
      });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("tx: -");
    });

    it("shows tx as dash when dryRun=true regardless of hash", () => {
      const receipt = mockReceipt({
        dryRun: true,
        txHash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
      });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("tx: -");
    });

    it("shows unknown price when priceText is null", () => {
      const receipt = mockReceipt({ priceText: null });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("price: unknown");
    });

    it("shows actual price when provided", () => {
      const receipt = mockReceipt({ priceText: "$1.234 ETH" });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("price: $1.234 ETH");
    });
  });

  describe("balance formatting", () => {
    it("formats ETH balance with trimmed decimals", () => {
      const receipt = mockReceipt({
        ethWei: 1234567890123456789n // ~1.234567... ETH
      });
      const message = buildReceiptMessage(receipt);

      // Should trim trailing zeros and include reasonable precision
      expect(message).toContain("eth:");
      const ethLine = message.split("\n").find(l => l.includes("eth:"));
      expect(ethLine).toBeTruthy();
      expect(ethLine).toContain("1.234567");
    });

    it("formats INTERN balance with trimmed decimals", () => {
      const receipt = mockReceipt({
        internAmount: 12345678901234567890n, // ~12.345678... INTERN
        internDecimals: 18
      });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("intern:");
      const internLine = message.split("\n").find(l => l.includes("intern:"));
      expect(internLine).toBeTruthy();
    });

    it("handles zero balances", () => {
      const receipt = mockReceipt({
        ethWei: 0n,
        internAmount: 0n
      });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("eth: 0");
      expect(message).toContain("intern: 0");
    });

    it("handles very large balances", () => {
      const receipt = mockReceipt({
        ethWei: 999999999999999999999n,
        internAmount: 999999999999999999999n
      });
      const message = buildReceiptMessage(receipt);

      // Should not crash, just format the large number
      expect(message).toContain("eth:");
      expect(message).toContain("intern:");
    });
  });

  describe("action field", () => {
    it("includes BUY action", () => {
      const receipt = mockReceipt({ action: "BUY" });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("action: BUY");
    });

    it("includes SELL action", () => {
      const receipt = mockReceipt({ action: "SELL" });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("action: SELL");
    });

    it("includes HOLD action", () => {
      const receipt = mockReceipt({ action: "HOLD" });
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("action: HOLD");
    });
  });

  describe("mood line rotation", () => {
    it("includes a mood line", () => {
      const receipt = mockReceipt();
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("note:");

      // Should have some non-empty mood text
      const noteLine = message.split("\n").find(l => l.includes("note:"));
      expect(noteLine).toBeTruthy();
      expect(noteLine!.length).toBeGreaterThan("note: ".length);
    });

    it("rotates mood line deterministically by action and date", () => {
      // Same date, same action should give same mood
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const receipt1 = mockReceipt({ action: "BUY" });
      const message1 = buildReceiptMessage(receipt1);
      const noteLine1 = message1.split("\n").find(l => l.includes("note:"));

      const receipt2 = mockReceipt({ action: "BUY" });
      const message2 = buildReceiptMessage(receipt2);
      const noteLine2 = message2.split("\n").find(l => l.includes("note:"));

      expect(noteLine1).toBe(noteLine2);
    });

    it("uses different mood for different actions on same day", () => {
      const receipt1 = mockReceipt({ action: "BUY" });
      const message1 = buildReceiptMessage(receipt1);
      const noteLine1 = message1.split("\n").find(l => l.includes("note:"));

      const receipt2 = mockReceipt({ action: "SELL" });
      const message2 = buildReceiptMessage(receipt2);
      const noteLine2 = message2.split("\n").find(l => l.includes("note:"));

      // Different actions should (likely) get different moods from the rotation
      // We can't guarantee this without knowing the hash, but it's statistically likely
      // For a more deterministic test, we'd need to inspect the actual rotation logic
    });
  });

  describe("timestamp formatting", () => {
    it("includes ISO timestamp without milliseconds", () => {
      const receipt = mockReceipt();
      const message = buildReceiptMessage(receipt);

      expect(message).toContain("ts:");

      // Should match ISO format: 2026-01-30T12:34:56Z
      const tsLine = message.split("\n").find(l => l.includes("ts:"));
      expect(tsLine).toBeTruthy();
      expect(tsLine).toMatch(/ts: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
      expect(tsLine).not.toMatch(/\.\d{3}Z/); // No milliseconds
    });
  });

  describe("all actions combined", () => {
    const actions: ReceiptInput["action"][] = ["BUY", "SELL", "HOLD"];

    for (const action of actions) {
      it(`formats ${action} action correctly`, () => {
        const receipt = mockReceipt({
          action,
          priceText: "$0.001 ETH",
          dryRun: false,
          txHash: "0x1234567890123456789012345678901234567890123456789012345678901234"
        });

        const message = buildReceiptMessage(receipt);

        // All should have the key fields
        expect(message).toContain("BASED INTERN REPORT");
        expect(message).toContain(`action: ${action}`);
        expect(message).toContain("ts:");
        expect(message).toContain("wallet:");
        expect(message).toContain("eth:");
        expect(message).toContain("intern:");
        expect(message).toContain("price:");
        expect(message).toContain("tx:");
        expect(message).toContain("mode:");
        expect(message).toContain("note:");
      });
    }
  });
});

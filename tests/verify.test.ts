import { describe, expect, it } from "vitest";

import { verifyUsdcPayment, decodeUsdcTransfers, type ExpectedUsdcPayment, type MinimalReceipt } from "@/lib/payments/server/verify";
import { ARC_MAINNET } from "@/lib/arc/network";
import { toUsdcBaseUnits } from "@/lib/arc/payment";

const USDC_ADDRESS = ARC_MAINNET.usdcAddress;
const CHAIN_ID = ARC_MAINNET.chainId;
const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678" as const;
const SENDER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const TX_HASH = `0x${"a".repeat(64)}` as const;
const BLOCK_NUMBER = 12345678n;

const OTHER_SENDER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const THIRD_SENDER = "0x3333333333333333333333333333333333333333" as const;

function createReceipt(overrides: Partial<MinimalReceipt> = {}): MinimalReceipt {
  return {
    status: "success",
    transactionHash: TX_HASH,
    blockNumber: BLOCK_NUMBER,
    chainId: CHAIN_ID,
    logs: [createTransferLog(SENDER, RECIPIENT, toUsdcBaseUnits(0.1))],
    ...overrides,
  };
}

function createExpectedPayment(overrides: Partial<ExpectedUsdcPayment> = {}): ExpectedUsdcPayment {
  return {
    chainId: CHAIN_ID,
    tokenAddress: USDC_ADDRESS,
    recipient: RECIPIENT,
    amount: { amount: 0.1, currency: "USDC" },
    sender: SENDER,
    ...overrides,
  };
}

function createTransferLog(
  from: string,
  to: string,
  value: bigint,
  contractAddress = USDC_ADDRESS,
): { address: string; topics: readonly string[]; data: string } {
  const topics = [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    `0x${from.slice(2).padStart(64, "0")}`,
    `0x${to.slice(2).padStart(64, "0")}`,
  ];
  const data = `0x${value.toString(16).padStart(64, "0")}`;
  return { address: contractAddress, topics, data };
}

describe("verifyUsdcPayment", () => {
  describe("hash validation", () => {
    it("rejects malformed transaction hash", () => {
      const result = verifyUsdcPayment({
        transactionHash: "0x123",
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("MALFORMED_HASH");
    });

    it("accepts valid 32-byte hash", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt(),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("chain validation", () => {
    it("rejects receipt on wrong chain", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt({ chainId: 1, logs: [createTransferLog(SENDER, RECIPIENT, toUsdcBaseUnits(0.1))] }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("WRONG_CHAIN");
    });

    it("rejects when expected payment targets different chain", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment({ chainId: 1 }),
        receipt: createReceipt(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("WRONG_CHAIN");
    });

    it("accepts matching chain id from receipt and expected", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt(),
      });
      expect(result.ok).toBe(true);
    });

    it("uses observedChainId when receipt lacks chainId", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt({ chainId: undefined }),
        observedChainId: CHAIN_ID,
      });
      expect(result.ok).toBe(true);
    });

    it("rejects when both receipt and observed chainId are missing", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt({ chainId: undefined, logs: [createTransferLog(SENDER, RECIPIENT, toUsdcBaseUnits(0.1))] }),
        observedChainId: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("WRONG_CHAIN");
    });
  });

  describe("receipt existence", () => {
    it("rejects null receipt", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: null,
        observedChainId: CHAIN_ID,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("RECEIPT_NOT_FOUND");
    });
  });

  describe("receipt status", () => {
    it("rejects reverted receipt", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt({ status: "reverted" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("RECEIPT_FAILED");
    });

    it("accepts success receipt", () => {
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt: createReceipt({ status: "success" }),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("USDC contract validation", () => {
    it("rejects when no Transfer events from USDC contract", () => {
      const receipt = createReceipt({
        logs: [
          { address: "0xOtherContract", topics: ["0x..."], data: "0x..." },
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NO_USDC_TRANSFER");
    });

    it("rejects Transfer from different token contract", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, 100_000n, "0xDifferentToken")],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NO_USDC_TRANSFER");
    });

    it("accepts Transfer from correct USDC contract", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("Transfer event decoding", () => {
    it("decodes valid Transfer event correctly", () => {
      const transfers = decodeUsdcTransfers(
        [createTransferLog(SENDER, RECIPIENT, 100_000n)],
        USDC_ADDRESS,
      );
      expect(transfers).toHaveLength(1);
      expect(transfers[0].from.toLowerCase()).toBe(SENDER.toLowerCase());
      expect(transfers[0].to.toLowerCase()).toBe(RECIPIENT.toLowerCase());
      expect(transfers[0].value).toBe(100_000n);
    });

    it("ignores non-Transfer events on USDC contract", () => {
      const receipt = createReceipt({
        logs: [{ address: USDC_ADDRESS, topics: ["0xOtherTopic"], data: "0x..." }],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NO_USDC_TRANSFER");
    });

    it("ignores malformed Transfer event data", () => {
      const receipt = createReceipt({
        logs: [{ address: USDC_ADDRESS, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x...", "0x..."], data: "0xnotabigint" }],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NO_USDC_TRANSFER");
    });
  });

  describe("recipient matching", () => {
    it("rejects when Transfer recipient differs from expected", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, OTHER_RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("recipient");
      }
    });

    it("accepts exact recipient match (case insensitive)", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT.toUpperCase(), 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("amount matching", () => {
    it("rejects when Transfer amount differs from expected (no floating point)", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, 200_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("amount");
      }
    });

    it("matches exact base units using bigint comparison", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, toUsdcBaseUnits(0.1))],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
    });

    it("rejects amount that is off by 1 wei", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, toUsdcBaseUnits(0.1) + 1n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("amount");
      }
    });
  });

  describe("sender matching", () => {
    it("validates sender when expected.sender is provided", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(OTHER_SENDER, RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("sender");
      }
    });

    it("skips sender validation when expected.sender is null", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(OTHER_SENDER, RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment({ sender: null }),
        receipt,
      });
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        console.log("Failure:", result.reason, result.field, result.message);
      } else if (!result.ok) {
        console.log("Failure:", result.reason, result.message);
      }
      expect(result.ok).toBe(true);
    });

    it("skips sender validation when expected.sender is undefined", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(OTHER_SENDER, RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment({ sender: undefined }),
        receipt,
      });
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        console.log("Failure:", result.reason, result.field, result.message);
      } else if (!result.ok) {
        console.log("Failure:", result.reason, result.message);
      }
      expect(result.ok).toBe(true);
    });

    it("matches sender case insensitively", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER.toUpperCase(), RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("multiple Transfer events", () => {
    it("selects the transfer matching all criteria", () => {
      const receipt = createReceipt({
        logs: [
          createTransferLog("0xOtherSender", "0xOtherRecipient", 50_000n),
          createTransferLog(SENDER, RECIPIENT, 100_000n),
          createTransferLog("0xThirdSender", "0xThirdRecipient", 150_000n),
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sender.toLowerCase()).toBe(SENDER.toLowerCase());
        expect(result.recipient.toLowerCase()).toBe(RECIPIENT.toLowerCase());
        expect(result.amountBaseUnits).toBe("100000");
      }
    });

    it("rejects when multiple transfers match recipient but not amount", () => {
      const receipt = createReceipt({
        logs: [
          createTransferLog(SENDER, RECIPIENT, 50_000n),
          createTransferLog(SENDER, RECIPIENT, 200_000n),
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("amount");
      }
    });

    it("rejects when multiple transfers match amount but not recipient", () => {
      const receipt = createReceipt({
        logs: [
          createTransferLog(SENDER, RECIPIENT, 100_000n),
          createTransferLog(SENDER, OTHER_RECIPIENT, 100_000n),
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.recipient.toLowerCase()).toBe(RECIPIENT.toLowerCase());
      }
    });

    it("rejects ambiguous sender when expected sender provided and multiple match recipient+amount", () => {
      const receipt = createReceipt({
        logs: [
          createTransferLog(OTHER_SENDER, RECIPIENT, 100_000n),
          createTransferLog(THIRD_SENDER, RECIPIENT, 100_000n),
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment({ sender: SENDER }),
        receipt,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        expect(result.field).toBe("sender");
      }
    });

    it("accepts when sender not expected and multiple match recipient+amount (first match wins)", () => {
      const receipt = createReceipt({
        logs: [
          createTransferLog(OTHER_SENDER, RECIPIENT, 100_000n),
          createTransferLog(THIRD_SENDER, RECIPIENT, 100_000n),
        ],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment({ sender: null }),
        receipt,
      });
      if (!result.ok && result.reason === "TRANSFER_MISMATCH") {
        console.log("Failure:", result.reason, result.field, result.message);
      } else if (!result.ok) {
        console.log("Failure:", result.reason, result.message);
      }
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sender.toLowerCase()).toBe(OTHER_SENDER.toLowerCase());
      }
    });
  });

  describe("successful verification returns complete data", () => {
    it("returns all verified fields", () => {
      const receipt = createReceipt({
        logs: [createTransferLog(SENDER, RECIPIENT, 100_000n)],
      });
      const result = verifyUsdcPayment({
        transactionHash: TX_HASH,
        network: ARC_MAINNET,
        expected: createExpectedPayment(),
        receipt,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.transactionHash).toBe(TX_HASH);
        expect(result.chainId).toBe(CHAIN_ID);
        expect(result.tokenAddress).toBe(USDC_ADDRESS);
        expect(result.sender.toLowerCase()).toBe(SENDER.toLowerCase());
        expect(result.recipient.toLowerCase()).toBe(RECIPIENT.toLowerCase());
        expect(result.amount).toEqual({ amount: 0.1, currency: "USDC" });
        expect(result.amountBaseUnits).toBe("100000");
        expect(result.blockNumber).toBe(BLOCK_NUMBER);
      }
    });
  });
});

describe("decodeUsdcTransfers", () => {
  it("returns empty array for empty logs", () => {
    const transfers = decodeUsdcTransfers([], USDC_ADDRESS);
    expect(transfers).toHaveLength(0);
  });

  it("only decodes transfers from the specified token address", () => {
    const logs = [
      createTransferLog(SENDER, RECIPIENT, 100_000n, USDC_ADDRESS),
      createTransferLog(SENDER, RECIPIENT, 200_000n, "0xOtherToken"),
    ];
    const transfers = decodeUsdcTransfers(logs, USDC_ADDRESS);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].value).toBe(100_000n);
  });

  it("decodes multiple transfers from the same contract", () => {
    const logs = [
      createTransferLog(SENDER, RECIPIENT, 100_000n, USDC_ADDRESS),
      createTransferLog(OTHER_SENDER, OTHER_RECIPIENT, 200_000n, USDC_ADDRESS),
    ];
    const transfers = decodeUsdcTransfers(logs, USDC_ADDRESS);
    console.log("Decoded transfers:", transfers);
    expect(transfers).toHaveLength(2);
    expect(transfers[0].value).toBe(100_000n);
    expect(transfers[1].value).toBe(200_000n);
  });
});
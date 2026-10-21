/**
 * Service-level regression tests for `verifyTrustedPayment` receipt-hash
 * binding (Phase 50.2A).
 *
 * No network and no database: the chain reader is injected and the trusted
 * repository is the in-memory adapter. These tests prove that a receipt
 * belonging to a different transaction is rejected with no payment-record
 * write and no intent consumption, while a matching hash (in either letter
 * case) verifies through the existing path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import { toUsdcBaseUnits } from "@/lib/arc/payment";
import type { ArcChainReader } from "@/lib/payments/server/chain";
import type { MinimalReceipt } from "@/lib/payments/server/verify";
import type { EvmAddress, PaymentIntent } from "@/types";

const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as EvmAddress;
const RECIPIENT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as EvmAddress;
const SENDER = "0xcccccccccccccccccccccccccccccccccccccccc" as EvmAddress;
const TX_HASH_A = `0x${"a".repeat(64)}` as const;
const TX_HASH_A_UPPER = `0x${"a".repeat(64).toUpperCase()}` as const;
const TX_HASH_B = `0x${"b".repeat(64)}` as const;

const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";
const USDC = ARC_MAINNET.usdcAddress as EvmAddress;

type ServiceModule = typeof import("@/lib/payments/server/service");
type FactoryModule = typeof import("@/lib/payments/server/factory");

let service: ServiceModule;
let factory: FactoryModule;

function makeIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  const now = new Date();
  return {
    id: "pay_test_intent",
    agentId: "agent_test",
    serviceId: "test-service",
    serviceName: "Test Service",
    sender: SENDER,
    recipient: RECIPIENT,
    amount: { amount: 0.1, currency: "USDC" },
    amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
    currency: "USDC",
    chainId: ARC_MAINNET.chainId,
    tokenAddress: USDC,
    status: "pending",
    txHash: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    ownerWalletAddress: OWNER,
    ...overrides,
  };
}

function makeTransferLog(): { address: string; topics: string[]; data: string } {
  return {
    address: USDC,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${SENDER.slice(2).padStart(64, "0")}`,
      `0x${RECIPIENT.slice(2).padStart(64, "0")}`,
    ],
    data: `0x${toUsdcBaseUnits(0.1).toString(16).padStart(64, "0")}`,
  };
}

function makeReceipt(overrides: Partial<MinimalReceipt> = {}): MinimalReceipt {
  return {
    status: "success",
    transactionHash: TX_HASH_A,
    blockNumber: 123n,
    from: SENDER,
    to: RECIPIENT,
    chainId: ARC_MAINNET.chainId,
    logs: [makeTransferLog()],
    ...overrides,
  };
}

function makeReader(receipt: MinimalReceipt | null): ArcChainReader {
  return {
    getChainId: async () => ARC_MAINNET.chainId,
    getTransactionReceipt: async () => receipt,
  };
}

async function seedIntent(overrides: Partial<PaymentIntent> = {}): Promise<PaymentIntent> {
  const repo = await factory.getTrustedRepository();
  const intent = makeIntent(overrides);
  await repo.createIntent(intent);
  return intent;
}

beforeEach(async () => {
  process.env[ENV_KEY] = "0xdddddddddddddddddddddddddddddddddddddddd";
  vi.resetModules();
  service = await import("@/lib/payments/server/service");
  factory = await import("@/lib/payments/server/factory");
  factory.setTrustedRepositoryForTesting(factory.createInMemoryTrustedRepository());
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

describe("verifyTrustedPayment — receipt hash binding", () => {
  it("verifies and records when the receipt hash matches the requested hash", async () => {
    const intent = await seedIntent();

    const outcome = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt()),
    });

    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.alreadyRecorded).toBe(false);
    expect(outcome.record.txHash).toBe(TX_HASH_A);

    const stored = await (await factory.getTrustedRepository()).listPayments();
    expect(stored).toHaveLength(1);
    const consumed = await (await factory.getTrustedRepository()).getIntent(intent.id);
    expect(consumed?.status).toBe("consumed");
  });

  it("verifies a case-variant receipt hash (uppercase receipt, lowercase request)", async () => {
    const intent = await seedIntent();

    const outcome = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt({ transactionHash: TX_HASH_A_UPPER })),
    });

    expect(outcome.status).toBe("verified");
  });

  it("rejects a mismatched receipt hash without writing a record or consuming the intent", async () => {
    const intent = await seedIntent();

    const outcome = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt({ transactionHash: TX_HASH_B })),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "RECEIPT_HASH_MISMATCH",
      message: expect.any(String),
    });

    const repo = await factory.getTrustedRepository();
    expect(await repo.listPayments()).toEqual([]);
    const unconsumed = await repo.getIntent(intent.id);
    expect(unconsumed?.status).toBe("pending");
  });

  it("rejects an uppercase requested hash that does not match the receipt's transaction", async () => {
    const intent = await seedIntent();

    const outcome = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A_UPPER,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt({ transactionHash: TX_HASH_B })),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "RECEIPT_HASH_MISMATCH",
      message: expect.any(String),
    });
    expect(await (await factory.getTrustedRepository()).listPayments()).toEqual([]);
  });

  it("treats a case-variant resubmission as the same record (canonical hash)", async () => {
    const intent = await seedIntent();

    const first = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt()),
    });
    expect(first.status).toBe("verified");

    // The uppercase variant must hit the idempotency pre-check before any
    // chain read: the injected reader would reject it (mismatched receipt)
    // if the lookup missed, so passing proves the canonical lookup fired.
    const second = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A_UPPER,
      authenticatedWallet: OWNER,
      chain: makeReader(makeReceipt({ transactionHash: TX_HASH_B })),
    });

    expect(second.status).toBe("verified");
    if (first.status !== "verified" || second.status !== "verified") return;
    expect(second.alreadyRecorded).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.txHash).toBe(TX_HASH_A);
    expect(await (await factory.getTrustedRepository()).listPayments()).toHaveLength(1);
  });
});

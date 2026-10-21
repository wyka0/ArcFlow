/**
 * Service-level tests for `recoverTrustedPayment` (Phase 51.2 — L3 ownership
 * and L4 atomic settlement).
 *
 * No network and no database: the chain reader is injected and the trusted
 * repository is the in-memory adapter. A reader whose receipt call throws is
 * used to prove that ownership rejections happen *before* any verification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import { toUsdcBaseUnits } from "@/lib/arc/payment";
import type { ArcChainReader } from "@/lib/payments/server/chain";
import type { MinimalReceipt } from "@/lib/payments/server/verify";
import type { EvmAddress, PaymentIntent, TrustedPayment } from "@/types";

const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as EvmAddress;
const OTHER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as EvmAddress;
const RECIPIENT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as EvmAddress;
const SENDER = "0xcccccccccccccccccccccccccccccccccccccccc" as EvmAddress;
const TX_HASH_A = `0x${"a".repeat(64)}` as const;
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
    id: "pay_recover_intent",
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
    // Recovery intentionally bypasses intent expiry — the fixture is expired.
    expiresAt: new Date(now.getTime() - 3_600_000).toISOString(),
    ownerWalletAddress: OWNER,
    ...overrides,
  };
}

function makeTransferLog(from = SENDER, to = RECIPIENT, value = toUsdcBaseUnits(0.1)) {
  return {
    address: USDC,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${from.slice(2).padStart(64, "0")}`,
      `0x${to.slice(2).padStart(64, "0")}`,
    ],
    data: `0x${value.toString(16).padStart(64, "0")}`,
  };
}

function makeReceipt(txHash: string, overrides: Partial<MinimalReceipt> = {}): MinimalReceipt {
  return {
    status: "success",
    transactionHash: txHash,
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

/** A reader that fails the test if the service reaches verification. */
function readerMustNotBeCalled(): ArcChainReader {
  return {
    getChainId: async () => ARC_MAINNET.chainId,
    getTransactionReceipt: async () => {
      throw new Error("reader must not be called before ownership rejection");
    },
  };
}

async function seedIntent(overrides: Partial<PaymentIntent> = {}): Promise<PaymentIntent> {
  const repo = await factory.getTrustedRepository();
  const intent = makeIntent(overrides);
  await repo.createIntent(intent);
  return intent;
}

function recover(intentId: string, txHash: string, wallet: EvmAddress, reader: ArcChainReader) {
  return service.recoverTrustedPayment({
    intentId,
    txHash: txHash as `0x${string}`,
    authenticatedWallet: wallet,
    chain: reader,
  });
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

describe("recoverTrustedPayment — L3 ownership", () => {
  it("rejects ownerless-intent recovery before verification or persistence", async () => {
    const intent = await seedIntent({ ownerWalletAddress: null });

    const outcome = await recover(intent.id, TX_HASH_A, OTHER, readerMustNotBeCalled());

    expect(outcome).toEqual({
      status: "rejected",
      reason: "OWNER_REQUIRED",
      message: expect.any(String),
    });
    const repo = await factory.getTrustedRepository();
    expect(await repo.listPayments()).toEqual([]);
    expect((await repo.getIntent(intent.id))?.status).toBe("pending");
  });

  it("lets the matching owner recover an owned intent (expiry bypass preserved)", async () => {
    const intent = await seedIntent(); // expiresAt is in the past

    const outcome = await recover(intent.id, TX_HASH_A, OWNER, makeReader(makeReceipt(TX_HASH_A)));

    expect(outcome.status).toBe("recovered");
    if (outcome.status !== "recovered") return;
    expect(outcome.alreadyRecorded).toBe(false);
    expect(outcome.record.txHash).toBe(TX_HASH_A);
    expect(outcome.record.intentId).toBe(intent.id);
    expect(outcome.record.ownerWalletAddress?.toLowerCase()).toBe(OWNER.toLowerCase());

    const repo = await factory.getTrustedRepository();
    expect(await repo.listPayments()).toHaveLength(1);
    expect((await repo.getIntent(intent.id))?.status).toBe("consumed");
  });

  it("rejects cross-wallet recovery", async () => {
    const intent = await seedIntent({ ownerWalletAddress: OWNER });

    const outcome = await recover(intent.id, TX_HASH_A, OTHER, readerMustNotBeCalled());

    expect(outcome).toEqual({
      status: "rejected",
      reason: "FORBIDDEN",
      message: expect.any(String),
    });
    expect(await (await factory.getTrustedRepository()).listPayments()).toEqual([]);
  });

  it("never discloses an ownerless already-recorded payment", async () => {
    const intent = await seedIntent({ ownerWalletAddress: OWNER });
    const repo = await factory.getTrustedRepository();
    const ownerless: TrustedPayment = {
      id: "tpay_ownerless",
      txHash: TX_HASH_A,
      chainId: ARC_MAINNET.chainId,
      tokenAddress: USDC,
      agentId: "agent_test",
      serviceId: "test-service",
      serviceName: "Test Service",
      sender: SENDER,
      recipient: RECIPIENT,
      amount: { amount: 0.1, currency: "USDC" },
      currency: "USDC",
      amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
      status: "confirmed",
      blockNumber: "1",
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ownerWalletAddress: null,
      intentId: null,
    };
    await repo.insertPayment(ownerless);

    // Even the intent's rightful owner receives no record contents.
    const outcome = await recover(intent.id, TX_HASH_A, OWNER, readerMustNotBeCalled());

    expect(outcome).toEqual({
      status: "rejected",
      reason: "FORBIDDEN",
      message: expect.any(String),
    });
  });

  it("rejects an already-settled intent", async () => {
    const intent = await seedIntent();
    const repo = await factory.getTrustedRepository();
    await repo.consumeIntent(intent.id, TX_HASH_B, new Date().toISOString());

    const outcome = await recover(intent.id, TX_HASH_A, OWNER, readerMustNotBeCalled());

    expect(outcome).toEqual({
      status: "rejected",
      reason: "INTENT_ALREADY_SETTLED",
      message: expect.any(String),
    });
  });
});

describe("recoverTrustedPayment — L4 atomic settlement", () => {
  it("exactly one of two concurrent settlements with different hashes succeeds", async () => {
    const intent = await seedIntent();

    const [first, second] = await Promise.all([
      recover(intent.id, TX_HASH_A, OWNER, makeReader(makeReceipt(TX_HASH_A))),
      recover(intent.id, TX_HASH_B, OWNER, makeReader(makeReceipt(TX_HASH_B))),
    ]);

    const outcomes = [first, second];
    const recovered = outcomes.filter((o) => o.status === "recovered");
    const conflicts = outcomes.filter(
      (o) => o.status === "rejected" && o.reason === "INTENT_ALREADY_SETTLED",
    );
    expect(recovered).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    const repo = await factory.getTrustedRepository();
    const stored = await repo.listPayments();
    // The losing settlement created no payment record.
    expect(stored).toHaveLength(1);
    expect(stored[0].intentId).toBe(intent.id);
    expect((await repo.getIntent(intent.id))?.status).toBe("consumed");
  });

  it("rolls back the settlement conflict so no payment persists without consumption", async () => {
    const intent = await seedIntent();
    const repo = await factory.getTrustedRepository();

    // The intent is settled by TX_HASH_B first.
    await recover(intent.id, TX_HASH_B, OWNER, makeReader(makeReceipt(TX_HASH_B)));
    expect(await repo.listPayments()).toHaveLength(1);

    // A different genuine transaction attempts the same (consumed) intent via
    // a second pending intent sharing nothing — use a fresh pending intent to
    // exercise the settle-level conflict directly.
    const conflicting = makeIntent({ id: "pay_conflict", status: "consumed", txHash: TX_HASH_B });
    await repo.createIntent(conflicting);
    const settlement = await repo.settleIntent({ intentId: conflicting.id, record: {
      id: "tpay_loser",
      txHash: TX_HASH_A,
      chainId: ARC_MAINNET.chainId,
      tokenAddress: USDC,
      agentId: "agent_test",
      serviceId: "test-service",
      serviceName: "Test Service",
      sender: SENDER,
      recipient: RECIPIENT,
      amount: { amount: 0.1, currency: "USDC" },
      currency: "USDC",
      amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
      status: "confirmed",
      blockNumber: "1",
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ownerWalletAddress: OWNER,
      intentId: conflicting.id,
    } });
    expect(settlement.status).toBe("intent_already_settled");
    // The losing payment was not persisted.
    expect(await repo.findByTxHash(TX_HASH_A)).toBeNull();
    const stored = await repo.listPayments();
    expect(stored).toHaveLength(1); // only the winner (TX_HASH_B)
    expect(stored.some((record) => record.intentId === conflicting.id)).toBe(false);
  });

  it("same-hash retry after a legacy insert-without-consume consumes the intent", async () => {
    const intent = await seedIntent();
    const repo = await factory.getTrustedRepository();

    // Legacy crash-window state: the payment was recorded but the intent was
    // never consumed (the old insert-then-consume race).
    const legacy: TrustedPayment = {
      id: "tpay_legacy",
      txHash: TX_HASH_A,
      chainId: ARC_MAINNET.chainId,
      tokenAddress: USDC,
      agentId: "agent_test",
      serviceId: "test-service",
      serviceName: "Test Service",
      sender: SENDER,
      recipient: RECIPIENT,
      amount: { amount: 0.1, currency: "USDC" },
      currency: "USDC",
      amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
      status: "confirmed",
      blockNumber: "1",
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ownerWalletAddress: OWNER,
      intentId: intent.id,
    };
    await repo.insertPayment(legacy);
    expect((await repo.getIntent(intent.id))?.status).toBe("pending");

    const retry = await recover(intent.id, TX_HASH_A, OWNER, readerMustNotBeCalled());

    expect(retry.status).toBe("recovered");
    if (retry.status !== "recovered") return;
    expect(retry.alreadyRecorded).toBe(true);
    expect(retry.record.id).toBe("tpay_legacy");
    // The retry healed the permanently-pending state.
    expect((await repo.getIntent(intent.id))?.status).toBe("consumed");
  });
});

describe("verifyTrustedPayment — demo compatibility preserved", () => {
  it("still verifies an ownerless intent for an anonymous caller (legacy demo flow)", async () => {
    const intent = await seedIntent({ ownerWalletAddress: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });

    const outcome = await service.verifyTrustedPayment({
      intentId: intent.id,
      txHash: TX_HASH_A,
      authenticatedWallet: null,
      chain: makeReader(makeReceipt(TX_HASH_A)),
    });

    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.record.ownerWalletAddress).toBeNull();
    expect(outcome.record.intentId).toBe(intent.id);
    // The settlement consumed the intent atomically.
    expect((await (await factory.getTrustedRepository()).getIntent(intent.id))?.status).toBe("consumed");
  });
});

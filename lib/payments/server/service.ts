import { getArcNetworkByChainId, getActiveArcNetwork } from "@/lib/arc/network";
import { toUsdcBaseUnits } from "@/lib/arc/payment";
import {
  type AccountingPayment,
  type PolicyViolation,
  type SpendingSummary,
} from "@/lib/agent/policy";
import { DEMO_SPENDING_POLICY } from "@/lib/demo/agent";
import { evaluatePaymentGate } from "@/lib/payments/gate";
import { createPaymentId } from "@/lib/payments/id";
import { getService } from "@/lib/services/registry";
import type { EvmAddress, PaymentIntent, TrustedPayment } from "@/types";

import { createArcChainReader, type ArcChainReader } from "./chain";
import { INTENT_TTL_MS, resolveServerRecipient } from "./config";
import { getTrustedRepository } from "./factory";
import type { TrustedPaymentRepository } from "./repository";
import { verifyUsdcPayment } from "./verify";
import {
  buildSpendingSummaryTrusted,
  evaluateTrustedPolicy,
  trustedToAccounting,
} from "./accounting";

/**
 * Convert TrustedPayment records to AccountingPayment shape for legacy compatibility.
 */
function toAccounting(records: readonly TrustedPayment[]): AccountingPayment[] {
  return trustedToAccounting(records);
}

/** The authoritative daily spending summary, computed in UTC using trusted accounting. */
async function spendFrom(repository: TrustedPaymentRepository): Promise<SpendingSummary> {
  const records = await repository.listPayments();
  return buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, records, new Date());
}

/** Thrown when the trusted ledger cannot be reached. Callers must fail closed. */
export class TrustedLedgerUnavailableError extends Error {
  constructor(message = "The trusted payment ledger is unavailable.") {
    super(message);
    this.name = "TrustedLedgerUnavailableError";
  }
}

export interface LedgerAdapter {
  repository: TrustedPaymentRepository;
  chain: ArcChainReader;
}

async function withLedger<T>(
  operation: (ledger: LedgerAdapter) => Promise<T>,
  chain?: ArcChainReader,
): Promise<T> {
  try {
    const repository = await getTrustedRepository();
    const resolved = chain ?? createArcChainReader(getActiveArcNetwork());
    return await operation({ repository, chain: resolved });
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) throw error;
    throw new TrustedLedgerUnavailableError();
  }
}

export type IntentOutcome =
  | { status: "ready"; intent: PaymentIntent; spending: SpendingSummary }
  | {
      status: "blocked";
      kind: "policy" | "recipient";
      serviceId: string;
      reason: string;
      violations: readonly PolicyViolation[];
      spending: SpendingSummary;
    };

/**
 * Create an approved payment intent.
 *
 * The amount, recipient, token, and chain are all fixed server-side. If the
 * trusted ledger cannot be read, this throws and the caller must fail closed —
 * an unreadable ledger must never be treated as "no spending yet".
 */
export async function createPaymentIntent(input: {
  agentId: string;
  serviceId: string;
  sender: EvmAddress | null;
  ownerWalletAddress: EvmAddress | null;
}): Promise<IntentOutcome> {
  return withLedger(async ({ repository }) => {
    const service = getService(input.serviceId);
    if (!service) {
      throw new TrustedLedgerUnavailableError("Unknown service.");
    }

    const records = await repository.listPayments();

    // Use trusted policy evaluation (server-side, bigint arithmetic) for spending
    const policyResult = evaluateTrustedPolicy({
      policy: DEMO_SPENDING_POLICY,
      serviceId: service.id,
      serviceName: service.name,
      serviceCategory: service.category,
      servicePrice: service.price,
      serviceCurrency: service.currency,
      serviceActive: service.active,
      history: records,
    });

    if (!policyResult.allowed) {
      return {
        status: "blocked",
        kind: "policy",
        serviceId: service.id,
        reason: policyResult.violations[0]?.message ?? "The spending policy rejected this payment.",
        violations: policyResult.violations,
        spending: policyResult.spending,
      };
    }

    // Use evaluatePaymentGate for recipient resolution (it uses the same policy internally)
    const decision = evaluatePaymentGate({
      service,
      policy: DEMO_SPENDING_POLICY,
      confirmedHistory: toAccounting(records),
      resolveRecipient: (serviceId) => {
        const address = resolveServerRecipient(serviceId);
        return { serviceId, address, isDemo: true };
      },
    });

    if (decision.status === "blocked") {
      return {
        status: "blocked",
        kind: decision.kind,
        serviceId: decision.serviceId,
        reason: decision.reason,
        violations: decision.violations,
        spending: decision.spending,
      };
    }

    const gateRequest = decision.request;
    const now = new Date();
    const network = getActiveArcNetwork();
    const intent: PaymentIntent = {
      id: gateRequest.id,
      agentId: input.agentId,
      serviceId: service.id,
      serviceName: service.name,
      sender: input.sender,
      recipient: gateRequest.recipient,
      amount: gateRequest.amount,
      amountBaseUnits: toUsdcBaseUnits(gateRequest.amount.amount).toString(),
      currency: "USDC",
      chainId: network.chainId,
      tokenAddress: network.usdcAddress,
      status: "pending",
      txHash: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
      ownerWalletAddress: input.ownerWalletAddress,
    };

    await repository.createIntent(intent);

    return { status: "ready", intent, spending: policyResult.spending };
  });
}

export type VerifyOutcome =
  | {
      status: "verified";
      record: TrustedPayment;
      alreadyRecorded: boolean;
      spending: SpendingSummary;
    }
  | { status: "rejected"; reason: string; message: string };

/**
 * Verify a claimed transaction against Arc and, only on success, record it.
 *
 * The client supplies only `intentId` and `txHash`. Everything else — amount,
 * recipient, sender, token, chain, success — is derived from the server-side
 * intent and the on-chain receipt.
 *
 * An optional `chain` reader may be supplied for tests; otherwise the default
 * Arc reader is used.
 */
export async function verifyTrustedPayment(input: {
  intentId: string;
  txHash: `0x${string}`;
  chain?: ArcChainReader;
  /**
   * Optional authenticated wallet. When provided, the server enforces that
   * the intent is owned by this wallet (when ownership is set). When the
   * intent is anonymous (legacy demo flow), this is ignored.
   */
  authenticatedWallet?: EvmAddress | null;
}): Promise<VerifyOutcome> {
  return withLedger(async ({ repository }) => {
    // Idempotency first: a known hash returns the existing record, unverified.
    const existing = await repository.findByTxHash(input.txHash);
    if (existing) {
      // Even on the idempotent path, the caller must own the payment.
      if (
        existing.ownerWalletAddress &&
        input.authenticatedWallet &&
        existing.ownerWalletAddress.toLowerCase() !== input.authenticatedWallet.toLowerCase()
      ) {
        return {
          status: "rejected",
          reason: "FORBIDDEN",
          message: "You are not authorised to verify this payment.",
        };
      }
      return {
        status: "verified",
        record: existing,
        alreadyRecorded: true,
        spending: await spendFrom(repository),
      };
    }

    const intent = await repository.getIntent(input.intentId);
    if (!intent) {
      return { status: "rejected", reason: "INTENT_NOT_FOUND", message: "Unknown payment intent." };
    }

    // Ownership check: if the intent is bound to a wallet, only that wallet
    // may verify it. An intent with no owner is the legacy demo flow and is
    // allowed for unauthenticated callers (and authenticated callers whose
    // wallet matches via the supplied `authenticatedWallet`).
    if (intent.ownerWalletAddress) {
      if (!input.authenticatedWallet) {
        return {
          status: "rejected",
          reason: "UNAUTHENTICATED",
          message: "This payment intent is owned by a wallet. Sign in to verify it.",
        };
      }
      if (intent.ownerWalletAddress.toLowerCase() !== input.authenticatedWallet.toLowerCase()) {
        return {
          status: "rejected",
          reason: "FORBIDDEN",
          message: "You are not authorised to verify this payment.",
        };
      }
    }

    if (intent.status === "consumed") {
      return {
        status: "rejected",
        reason: "INTENT_ALREADY_SETTLED",
        message: "This payment intent has already been settled by another transaction.",
      };
    }
    if (Number.isNaN(new Date(intent.expiresAt).getTime()) || new Date(intent.expiresAt) < new Date()) {
      return { status: "rejected", reason: "INTENT_EXPIRED", message: "The payment intent has expired." };
    }

    const network = getArcNetworkByChainId(intent.chainId);
    if (!network) {
      return {
        status: "rejected",
        reason: "WRONG_CHAIN",
        message: "The payment intent targets an unsupported network.",
      };
    }

    const reader = input.chain ?? createArcChainReader(network);
    const observedChainId = await reader.getChainId();
    const receipt = await reader.getTransactionReceipt(input.txHash);

    const verification = verifyUsdcPayment({
      transactionHash: input.txHash,
      network,
      expected: {
        chainId: intent.chainId,
        tokenAddress: intent.tokenAddress,
        recipient: intent.recipient,
        amount: intent.amount,
        sender: intent.sender,
      },
      receipt,
      observedChainId,
    });

    if (!verification.ok) {
      return {
        status: "rejected",
        reason: verification.reason,
        message: verification.message,
      };
    }

    const now = new Date().toISOString();
    const record: TrustedPayment = {
      id: createPaymentId(),
      txHash: verification.transactionHash,
      chainId: verification.chainId,
      tokenAddress: verification.tokenAddress,
      agentId: intent.agentId,
      serviceId: intent.serviceId,
      serviceName: intent.serviceName,
      sender: verification.sender,
      recipient: verification.recipient,
      amount: verification.amount,
      currency: "USDC",
      amountBaseUnits: verification.amountBaseUnits,
      status: "confirmed",
      blockNumber: verification.blockNumber.toString(),
      confirmedAt: now,
      createdAt: now,
      ownerWalletAddress: intent.ownerWalletAddress,
      intentId: intent.id,
    };

    const inserted = await repository.insertPayment(record);
    if (inserted.created) {
      await repository.consumeIntent(intent.id, inserted.record.txHash, now);
    }

    return {
      status: "verified",
      record: inserted.record,
      alreadyRecorded: !inserted.created,
      spending: await spendFrom(repository),
    };
  });
}

export interface TrustedHistory {
  records: TrustedPayment[];
  spending: SpendingSummary;
}

export async function getTrustedHistory(input: {
  /**
   * When provided, the history is restricted to records owned by this wallet.
   * When omitted, the legacy full-history view is returned (used by demos and
   * tests that have no authenticated user).
   */
  ownerWalletAddress?: EvmAddress | null;
} = {}): Promise<TrustedHistory> {
  return withLedger(async ({ repository }) => {
    const all = await repository.listPayments();
    const records =
      input.ownerWalletAddress === undefined
        ? all
        : all.filter(
            (record) =>
              record.ownerWalletAddress !== null &&
              record.ownerWalletAddress.toLowerCase() === input.ownerWalletAddress!.toLowerCase(),
          );
    return {
      records,
      spending: buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, records, new Date()),
    };
  });
}

export async function getTrustedSpending(): Promise<SpendingSummary> {
  return withLedger(async ({ repository }) => {
    const records = await repository.listPayments();
    return buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, records, new Date());
  });
}

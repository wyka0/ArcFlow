import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import { TrustedLedgerUnavailableError } from "@/lib/payments/server/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

import { getTrustedRepository } from "@/lib/payments/server/factory";
import { createArcReadClient } from "@/lib/arc/client";
import { getArcNetworkByChainId, getActiveArcNetwork, type ArcNetwork } from "@/lib/arc/network";
import { verifyUsdcPayment, type VerifiedTransfer } from "@/lib/payments/server/verify";
import { buildSpendingSummaryTrusted } from "@/lib/payments/server/accounting";
import { DEMO_SPENDING_POLICY } from "@/lib/demo/agent";
import { trustedToAccounting } from "@/lib/payments/server/accounting";

import type { EvmAddress, TrustedPayment, PaymentIntent, TransactionHash } from "@/types";
import type { SpendingSummary } from "@/lib/agent/policy";
import type { Hash } from "viem";

/**
 * POST /api/payments/recover
 *
 * Recovery endpoint for expired payment intents where a valid transaction
 * was submitted on-chain before the intent expired, but verification was
 * not completed before the intent expired.
 *
 * This endpoint:
 * - Requires authenticated owner wallet (same as original intent owner)
 * - Verifies the transaction independently on Arc Mainnet
 * - Checks the transaction exactly matches the expired intent
 * - Records the payment in the trusted ledger
 * - Marks the intent as consumed
 *
 * This does NOT create a new blockchain transaction.
 *
 * Authentication: requires the same authenticated wallet that owns the intent.
 *
 * Request:
 * {
 *   "intentId": "pay_...",
 *   "txHash": "0x...",
 *   "requestId": "pay_..." (optional, for additional validation)
 * }
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "alreadyRecorded": false,
 *   "record": { ... },
 *   "spending": { ... }
 * }
 *
 * Errors:
 * - 400: Invalid request
 * - 401: Unauthenticated / not the intent owner
 * - 403: Forbidden (different owner)
 * - 404: Intent not found / request not found
 * - 422: Verification failed (wrong chain, amount, recipient, etc.)
 * - 409: Transaction already claimed by another intent
 * - 503: Ledger unavailable
 * - 500: Internal error
 */
const MAX_BODY_BYTES = 2 * 1024;

async function spendFrom(repository: TrustedPaymentRepository): Promise<SpendingSummary> {
  const records = await repository.listPayments();
  return buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, records, new Date());
}

interface TrustedPaymentRepository {
  findByTxHash(txHash: string): Promise<TrustedPayment | null>;
  getIntent(id: string): Promise<PaymentIntent | null>;
  insertPayment(record: TrustedPayment): Promise<{ record: TrustedPayment; created: boolean }>;
  consumeIntent(id: string, txHash: string, at: string): Promise<void>;
  listPayments(): Promise<TrustedPayment[]>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<{
    intentId: string;
    txHash: string;
    requestId?: string;
  }>(request, {
    policy: "PAYMENT_VERIFY",
    maxBytes: 2 * 1024,
  });
  if (!guard.ok) return guard.response;

  const { intentId, txHash, requestId } = guard.body;

  if (!intentId || typeof intentId !== "string" || !/^pay_[A-Za-z0-9_-]+$/.test(intentId)) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_INTENT_ID", message: "Invalid or missing intentId." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  if (!txHash || typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_TX_HASH", message: "Invalid or missing txHash." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  if (requestId !== undefined && (typeof requestId !== "string" || !/^pay_[A-Za-z0-9_-]+$/.test(requestId))) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST_ID", message: "Invalid requestId." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const authenticatedWallet = await getOptionalWallet(request);
  if (!authenticatedWallet) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    const repository = await getTrustedRepository();

    // Get the intent
    const intent = await repository.getIntent(intentId);
    if (!intent) {
      const response = NextResponse.json(
        { ok: false, error: { code: "INTENT_NOT_FOUND", message: "Payment intent not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Ownership check: must be the intent owner
    if (intent.ownerWalletAddress) {
      if (intent.ownerWalletAddress.toLowerCase() !== authenticatedWallet.toLowerCase()) {
        logSecurityEvent({
          kind: "PAYMENT_VERIFY_REJECTED",
          keyHash: hashKey(authenticatedWallet),
          detail: `intentId=${intentId} reason=FORBIDDEN`,
        });
        const response = NextResponse.json(
          { ok: false, error: { code: "FORBIDDEN", message: "You are not authorised to recover this payment." } },
          { status: 403 },
        );
        applySecurityHeaders(response);
        return response;
      }
    } else {
      // Anonymous intent (legacy demo) - allow recovery by any authenticated user
      // but we still require authentication
    }

    // If requestId provided, validate it matches the intent's request
    if (requestId) {
      const { getServiceRequest } = await import("@/lib/services/service");
      const serviceRequest = await getServiceRequest(requestId);
      if (!serviceRequest || serviceRequest.paymentIntentId !== intentId) {
        const response = NextResponse.json(
          { ok: false, error: { code: "REQUEST_MISMATCH", message: "Provided requestId does not match intent." } },
          { status: 400 },
        );
        applySecurityHeaders(response);
        return response;
      }
    }

    // Check if intent is already consumed
    if (intent.status === "consumed") {
      const response = NextResponse.json(
        { ok: false, error: { code: "INTENT_ALREADY_SETTLED", message: "This payment intent has already been settled." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Check if txHash is already recorded (idempotency)
    const existing = await repository.findByTxHash(txHash as TransactionHash);
    if (existing) {
      if (
        existing.ownerWalletAddress &&
        existing.ownerWalletAddress.toLowerCase() !== authenticatedWallet.toLowerCase()
      ) {
        const response = NextResponse.json(
          { ok: false, error: { code: "FORBIDDEN", message: "You are not authorised to verify this payment." } },
          { status: 403 },
        );
        applySecurityHeaders(response);
        return response;
      }
      const response = NextResponse.json({
        ok: true,
        alreadyRecorded: true,
        record: existing,
        spending: await spendFrom(await getTrustedRepository()),
      });
      applySecurityHeaders(response);
      return response;
    }

    // Verify the transaction on Arc (bypass intent expiry check)
    const network = getArcNetworkByChainId(intent.chainId);
    if (!network) {
      const response = NextResponse.json(
        { ok: false, error: { code: "WRONG_CHAIN", message: "The payment intent targets an unsupported network." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const reader = createArcReadClient(network);
    const observedChainId = await reader.getChainId();
    const receipt = await reader.getTransactionReceipt({ hash: txHash } as { hash: Hash });

    const verification = verifyUsdcPayment({
      transactionHash: txHash as Hash,
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
      const response = NextResponse.json(
        { ok: false, error: { code: verification.reason, message: verification.message } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Verify exact match with original intent
    if (
      verification.recipient.toLowerCase() !== intent.recipient.toLowerCase() ||
      verification.tokenAddress.toLowerCase() !== intent.tokenAddress.toLowerCase() ||
      verification.chainId !== intent.chainId ||
      verification.amount.amount !== intent.amount.amount ||
      "USDC" !== intent.currency
    ) {
      const response = NextResponse.json(
        { ok: false, error: { code: "VERIFICATION_MISMATCH", message: "Transaction does not match the original intent." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Record the payment in the trusted ledger
    const now = new Date().toISOString();
    const record = {
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
      currency: "USDC" as const,
      amountBaseUnits: verification.amountBaseUnits,
      status: "confirmed" as const,
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

    logSecurityEvent({
      kind: "PAYMENT_VERIFIED",
      keyHash: hashKey(authenticatedWallet),
      detail: `intentId=${intentId} txHash=${txHash} recovery=true`,
    });

    const response = NextResponse.json({
      ok: true,
      alreadyRecorded: !inserted.created,
      record: inserted.record,
      spending: await spendFrom(await getTrustedRepository()),
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) {
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "The trusted payment ledger is unavailable.",
          },
        },
        { status: 503 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The payment could not be recovered." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}

function createPaymentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pay_${crypto.randomUUID()}`;
  }
  return `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
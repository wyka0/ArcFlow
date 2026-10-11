import { isAddress, type Address } from "viem";

import { isTransactionHash, prepareUsdcPayment } from "@/lib/arc/payment";
import type { ArcNetwork } from "@/lib/arc/network";
import type { PaymentRequest, TransactionHash } from "@/types";

import type { Eip1193Provider } from "./client";
import { getProviderErrorCode } from "./state";

/**
 * The only module in the project that submits a transaction.
 *
 * It exposes a narrow, payment-shaped operation — `sendUsdcTransfer` — and
 * nothing generic. The agent/decision layer does not import this module, so the
 * agent has no path to the wallet send method. Only the user-confirmation layer
 * calls it, after the policy gate has produced an approved `PaymentRequest`.
 */
export type PaymentExecutionErrorCode =
  | "USER_REJECTED"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_HASH"
  | "MALFORMED_REQUEST"
  | "SUBMISSION_FAILED";

export interface PaymentExecutionError {
  code: PaymentExecutionErrorCode;
  message: string;
}

export type SendUsdcTransferResult =
  | { ok: true; transactionHash: TransactionHash }
  | { ok: false; error: PaymentExecutionError };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.toLowerCase();
  }
  return "";
}

function toExecutionError(error: unknown): PaymentExecutionError {
  const code = getProviderErrorCode(error);

  if (code === 4001) {
    return {
      code: "USER_REJECTED",
      message: "Payment cancelled in the wallet. Nothing was sent.",
    };
  }

  const raw = errorMessage(error);
  if (raw.includes("insufficient")) {
    return {
      code: "INSUFFICIENT_FUNDS",
      message: "The wallet does not have enough USDC to cover this payment.",
    };
  }

  return {
    code: "SUBMISSION_FAILED",
    message: "The wallet could not submit the transaction.",
  };
}

function assertPayable(request: PaymentRequest): PaymentExecutionError | null {
  if (request.currency !== "USDC" || request.amount.currency !== "USDC") {
    return { code: "MALFORMED_REQUEST", message: "Only USDC payments are supported." };
  }
  if (!Number.isFinite(request.amount.amount) || request.amount.amount <= 0) {
    return { code: "MALFORMED_REQUEST", message: "The payment amount is invalid." };
  }
  if (!isAddress(request.recipient, { strict: false })) {
    return { code: "MALFORMED_REQUEST", message: "The payment recipient is invalid." };
  }
  return null;
}

export async function sendUsdcTransfer(input: {
  provider: Eip1193Provider;
  network: ArcNetwork;
  request: PaymentRequest;
  from: Address;
}): Promise<SendUsdcTransferResult> {
  const { provider, network, request, from } = input;

  const malformed = assertPayable(request);
  if (malformed) {
    return { ok: false, error: malformed };
  }

  let prepared;
  try {
    prepared = prepareUsdcPayment(request, network);
  } catch {
    return {
      ok: false,
      error: { code: "MALFORMED_REQUEST", message: "The payment could not be prepared." },
    };
  }

  try {
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: prepared.to,
          data: prepared.data,
          value: "0x0",
        },
      ],
    });

    if (!isTransactionHash(hash)) {
      return {
        ok: false,
        error: {
          code: "INVALID_HASH",
          message: "The wallet did not return a valid transaction hash. Nothing is marked as sent.",
        },
      };
    }

    return { ok: true, transactionHash: hash };
  } catch (error) {
    return { ok: false, error: toExecutionError(error) };
  }
}

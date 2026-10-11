import { isAddress } from "viem";

import { isTransactionHash } from "@/lib/arc/payment";
import { getService } from "@/lib/services/registry";
import type { EvmAddress, TransactionHash } from "@/types";

import { resolveServerRecipient } from "./config";

/**
 * Request validation for the trusted ledger API.
 *
 * Every client-supplied field is treated as untrusted. A client may choose only
 * which service it wants to pay for, its own wallet address, and the hash it
 * claims settled the payment. Amount, recipient, token, chain, and success are
 * always determined server-side.
 */

export type RequestErrorCode =
  | "INVALID_JSON"
  | "INVALID_TX_HASH"
  | "INVALID_INTENT"
  | "INVALID_SENDER"
  | "UNKNOWN_SERVICE";

export interface IntentRequestBody {
  agentId: string;
  serviceId: string;
  sender: EvmAddress | null;
}

export type ParseResult<T> =
  | { ok: true; body: T }
  | { ok: false; code: RequestErrorCode; message: string };

export function parseIntentRequest(raw: unknown): ParseResult<IntentRequestBody> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, code: "INVALID_JSON", message: "The request body must be a JSON object." };
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.agentId !== "string" || body.agentId.length === 0) {
    return { ok: false, code: "INVALID_JSON", message: "agentId is required." };
  }
  if (typeof body.serviceId !== "string" || body.serviceId.length === 0) {
    return { ok: false, code: "INVALID_JSON", message: "serviceId is required." };
  }
  if (!getService(body.serviceId)) {
    return { ok: false, code: "UNKNOWN_SERVICE", message: "Unknown service." };
  }

  let sender: EvmAddress | null = null;
  if (body.sender !== undefined && body.sender !== null) {
    if (typeof body.sender !== "string" || !isAddress(body.sender, { strict: false })) {
      return { ok: false, code: "INVALID_SENDER", message: "sender must be a valid EVM address." };
    }
    sender = body.sender as EvmAddress;
  }

  return { ok: true, body: { agentId: body.agentId, serviceId: body.serviceId, sender } };
}

export interface VerifyRequestBody {
  txHash: TransactionHash;
  intentId: string;
}

/**
 * Verification always requires an approved intent id. The client cannot supply
 * an amount, recipient, sender, or token.
 */
export function parseVerifyRequest(raw: unknown): ParseResult<VerifyRequestBody> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, code: "INVALID_JSON", message: "The request body must be a JSON object." };
  }

  const body = raw as Record<string, unknown>;

  if (!isTransactionHash(body.txHash)) {
    return {
      ok: false,
      code: "INVALID_TX_HASH",
      message: "txHash must be a valid 32-byte transaction hash.",
    };
  }

  if (typeof body.intentId !== "string" || body.intentId.length === 0) {
    return {
      ok: false,
      code: "INVALID_INTENT",
      message: "intentId is required and must reference an approved payment intent.",
    };
  }

  return { ok: true, body: { txHash: body.txHash, intentId: body.intentId } };
}

/** Resolves the server-configured recipient, or null when none is configured. */
export function resolveExpectedRecipient(serviceId: string): EvmAddress | null {
  return resolveServerRecipient(serviceId);
}

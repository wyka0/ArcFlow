import type { SpendingSummary } from "@/lib/agent/policy";
import type { EvmAddress, TrustedPayment } from "@/types";

/**
 * Browser-side client for the trusted ledger API.
 *
 * This module only speaks HTTP. It never reads or writes browser storage, and it
 * never treats a local cache as authoritative. Every failure is surfaced as a
 * typed unavailable/error state so callers can fail closed.
 */

export interface LedgerPersistence {
  kind: string;
  durable: boolean;
  label: string;
  note: string;
}

export interface TrustedHistoryPayload {
  records: TrustedPayment[];
  spending: SpendingSummary;
  persistence: LedgerPersistence;
}

export type LedgerResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export interface ApiErrorBody {
  ok: false;
  error: { code: string; message: string; kind?: string; violations?: unknown };
}

async function parseError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error?.code && body?.error?.message) {
      return { code: body.error.code, message: body.error.message };
    }
  } catch {
    // Fall through to a generic message.
  }
  return { code: "REQUEST_FAILED", message: "The trusted ledger request failed." };
}

export async function fetchTrustedHistory(): Promise<LedgerResult<TrustedHistoryPayload>> {
  try {
    const response = await fetch("/api/payments/history", { cache: "no-store" });
    if (!response.ok) {
      const error = await parseError(response);
      return { ok: false, ...error };
    }
    const body = (await response.json()) as {
      ok: true;
      records: TrustedPayment[];
      spending: SpendingSummary;
      persistence: LedgerPersistence;
    };
    return {
      ok: true,
      data: { records: body.records, spending: body.spending, persistence: body.persistence },
    };
  } catch {
    return {
      ok: false,
      code: "LEDGER_UNAVAILABLE",
      message: "Trusted ledger unavailable.",
    };
  }
}

export interface CreateIntentPayload {
  intent: {
    id: string;
    recipient: EvmAddress;
    amountBaseUnits: string;
    amount: { amount: number; currency: "USDC" };
    chainId: number;
    tokenAddress: EvmAddress;
    serviceId: string;
    serviceName: string;
  };
  spending: SpendingSummary;
}

export async function createTrustedIntent(input: {
  agentId: string;
  serviceId: string;
  sender: EvmAddress | null;
}): Promise<LedgerResult<CreateIntentPayload>> {
  try {
    const response = await fetch("/api/payments/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const body = (await response.json()) as
      | { ok: true; intent: CreateIntentPayload["intent"]; spending: SpendingSummary }
      | ApiErrorBody;

    if (!response.ok || !body.ok) {
      const error = "error" in body ? body.error : { code: "REQUEST_FAILED", message: "Intent failed." };
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: true, data: { intent: body.intent, spending: body.spending } };
  } catch {
    return {
      ok: false,
      code: "LEDGER_UNAVAILABLE",
      message: "Unable to verify the current spending limit.",
    };
  }
}

export interface VerifyPayload {
  record: TrustedPayment;
  alreadyRecorded: boolean;
  spending: SpendingSummary;
}

export async function verifyTrustedTransaction(input: {
  intentId: string;
  txHash: string;
}): Promise<LedgerResult<VerifyPayload>> {
  try {
    const response = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    const body = (await response.json()) as
      | { ok: true; record: TrustedPayment; alreadyRecorded: boolean; spending: SpendingSummary }
      | ApiErrorBody;

    if (!response.ok || !body.ok) {
      const error = "error" in body ? body.error : { code: "REQUEST_FAILED", message: "Verify failed." };
      return { ok: false, code: error.code, message: error.message };
    }

    return {
      ok: true,
      data: { record: body.record, alreadyRecorded: body.alreadyRecorded, spending: body.spending },
    };
  } catch {
    return {
      ok: false,
      code: "LEDGER_UNAVAILABLE",
      message: "The transaction could not be verified against the trusted ledger.",
    };
  }
}

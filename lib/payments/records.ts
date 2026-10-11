import { isAddress } from "viem";

import { getArcNetworkByChainId } from "@/lib/arc/network";
import { isTransactionHash } from "@/lib/arc/payment";
import type { ConfirmedPayment } from "@/types";

import type { PaymentEntry } from "./store";

/**
 * Single source of truth for what counts as a persistable confirmed payment.
 *
 * Used by the repository (when loading/hydrating from storage) and by the store
 * (when accepting hydrated records), so validation can never drift between them.
 */
export function isSupportedPaymentChain(chainId: unknown): chainId is number {
  return typeof chainId === "number" && getArcNetworkByChainId(chainId) !== null;
}

export function isValidConfirmedPayment(value: unknown): value is ConfirmedPayment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  if (record.status !== "confirmed") return false;
  if (!isTransactionHash(record.txHash)) return false;
  if (!isSupportedPaymentChain(record.chainId)) return false;

  if (typeof record.id !== "string" || record.id.length === 0) return false;
  if (typeof record.agentId !== "string" || record.agentId.length === 0) return false;
  if (typeof record.serviceId !== "string" || record.serviceId.length === 0) return false;
  if (typeof record.serviceName !== "string" || record.serviceName.length === 0) return false;
  if (record.currency !== "USDC") return false;

  if (typeof record.amount !== "number" || !Number.isFinite(record.amount) || record.amount <= 0) {
    return false;
  }
  if (typeof record.recipient !== "string" || !isAddress(record.recipient, { strict: false })) {
    return false;
  }
  if (typeof record.createdAt !== "string" || Number.isNaN(new Date(record.createdAt).getTime())) {
    return false;
  }

  return true;
}

/**
 * Promote a store entry into a persistable record.
 *
 * Returns null unless the entry is confirmed with a real hash — a pending,
 * submitted, or failed entry can never become persisted history.
 */
export function toConfirmedPayment(entry: PaymentEntry): ConfirmedPayment | null {
  if (entry.phase !== "confirmed" || !entry.transactionHash) return null;

  const candidate: ConfirmedPayment = {
    id: entry.id,
    agentId: entry.agentId,
    serviceId: entry.serviceId,
    serviceName: entry.serviceName,
    amount: entry.amount,
    currency: entry.currency,
    recipient: entry.recipient,
    chainId: entry.chainId,
    status: "confirmed",
    txHash: entry.transactionHash,
    createdAt: entry.createdAt,
  };

  return isValidConfirmedPayment(candidate) ? candidate : null;
}

/** Rebuild a store entry from a persisted record. */
export function fromConfirmedPayment(record: ConfirmedPayment): PaymentEntry {
  return {
    id: record.id,
    agentId: record.agentId,
    serviceId: record.serviceId,
    serviceName: record.serviceName,
    recipient: record.recipient,
    chainId: record.chainId,
    amount: record.amount,
    currency: record.currency,
    phase: "confirmed",
    transactionHash: record.txHash,
    failureReason: null,
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
  };
}

/**
 * Safely parse an unknown value into confirmed records.
 *
 * Invalid, malformed, or unrecognised entries are dropped rather than throwing,
 * so corrupted local data can never crash the application.
 */
export function parseConfirmedPayments(raw: unknown): ConfirmedPayment[] {
  if (!Array.isArray(raw)) return [];

  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const records: ConfirmedPayment[] = [];

  for (const candidate of raw) {
    if (!isValidConfirmedPayment(candidate)) continue;
    const id = candidate.id.toLowerCase();
    const hash = candidate.txHash.toLowerCase();
    if (seenIds.has(id) || seenHashes.has(hash)) continue;
    seenIds.add(id);
    seenHashes.add(hash);
    records.push(candidate);
  }

  return records;
}

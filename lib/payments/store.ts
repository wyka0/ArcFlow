import type { ConfirmedPayment, Currency, EvmAddress, TransactionHash } from "@/types";

import { fromConfirmedPayment, isValidConfirmedPayment, toConfirmedPayment } from "./records";

/**
 * Client-side payment state model.
 *
 * The store only ever changes through explicit actions and can never invent a
 * transaction or a hash: `submitted` requires a real hash and `confirmed`
 * requires a real on-chain receipt. Hydration accepts only records that pass
 * the shared confirmed-payment validator.
 */
export type PaymentPhase = "idle" | "pending" | "submitted" | "confirmed" | "failed";

export interface PaymentEntry {
  id: string;
  agentId: string;
  serviceId: string;
  serviceName: string;
  recipient: EvmAddress;
  chainId: number;
  amount: number;
  currency: Currency;
  phase: PaymentPhase;
  transactionHash: TransactionHash | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentsState {
  entries: readonly PaymentEntry[];
}

export const initialPaymentsState: PaymentsState = { entries: [] };

export type PaymentsAction =
  | {
      type: "payment/created";
      id: string;
      agentId: string;
      serviceId: string;
      serviceName: string;
      recipient: EvmAddress;
      chainId: number;
      amount: number;
      currency: Currency;
      createdAt: string;
    }
  | { type: "payment/submitted"; id: string; transactionHash: TransactionHash; at: string }
  | { type: "payment/confirmed"; id: string; at: string; transactionHash?: TransactionHash }
  | { type: "payment/failed"; id: string; reason: string; at: string }
  | { type: "payment/hydrated"; records: readonly ConfirmedPayment[] }
  | { type: "payments/reset" };

const VALID_TRANSITIONS: Record<PaymentPhase, readonly PaymentPhase[]> = {
  idle: ["pending"],
  pending: ["submitted", "failed"],
  submitted: ["confirmed", "failed"],
  confirmed: [],
  failed: [],
};

export function canTransition(from: PaymentPhase, to: PaymentPhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

function findEntry(
  state: PaymentsState,
  id: string,
): { index: number; entry: PaymentEntry } | null {
  const index = state.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const entry = state.entries[index];
  return entry ? { index, entry } : null;
}

function replaceEntry(
  state: PaymentsState,
  index: number,
  entry: PaymentEntry,
): PaymentsState {
  const entries = state.entries.slice();
  entries[index] = entry;
  return { entries };
}

export function paymentsReducer(state: PaymentsState, action: PaymentsAction): PaymentsState {
  switch (action.type) {
    case "payment/created": {
      if (state.entries.some((entry) => entry.id === action.id)) return state;
      const entry: PaymentEntry = {
        id: action.id,
        agentId: action.agentId,
        serviceId: action.serviceId,
        serviceName: action.serviceName,
        recipient: action.recipient,
        chainId: action.chainId,
        amount: action.amount,
        currency: action.currency,
        phase: "pending",
        transactionHash: null,
        failureReason: null,
        createdAt: action.createdAt,
        updatedAt: action.createdAt,
      };
      return { entries: [...state.entries, entry] };
    }

    case "payment/submitted": {
      const found = findEntry(state, action.id);
      if (!found || !canTransition(found.entry.phase, "submitted")) return state;
      return replaceEntry(state, found.index, {
        ...found.entry,
        phase: "submitted",
        transactionHash: action.transactionHash,
        updatedAt: action.at,
      });
    }

    case "payment/confirmed": {
      const found = findEntry(state, action.id);
      if (!found || !canTransition(found.entry.phase, "confirmed")) return state;
      const transactionHash = action.transactionHash ?? found.entry.transactionHash;
      if (!transactionHash) return state;
      return replaceEntry(state, found.index, {
        ...found.entry,
        phase: "confirmed",
        transactionHash,
        updatedAt: action.at,
      });
    }

    case "payment/failed": {
      const found = findEntry(state, action.id);
      if (!found || !canTransition(found.entry.phase, "failed")) return state;
      return replaceEntry(state, found.index, {
        ...found.entry,
        phase: "failed",
        failureReason: action.reason,
        updatedAt: action.at,
      });
    }

    case "payment/hydrated": {
      const knownIds = new Set(state.entries.map((entry) => entry.id.toLowerCase()));
      const knownHashes = new Set(
        state.entries
          .map((entry) => entry.transactionHash?.toLowerCase())
          .filter((hash): hash is string => Boolean(hash)),
      );

      const restored: PaymentEntry[] = [];
      for (const record of action.records) {
        // Defence in depth: never trust the caller to have validated.
        if (!isValidConfirmedPayment(record)) continue;
        if (knownIds.has(record.id.toLowerCase())) continue;
        if (knownHashes.has(record.txHash.toLowerCase())) continue;
        knownIds.add(record.id.toLowerCase());
        knownHashes.add(record.txHash.toLowerCase());
        restored.push(fromConfirmedPayment(record));
      }

      if (restored.length === 0) return state;
      return { entries: [...restored, ...state.entries] };
    }

    case "payments/reset":
      return initialPaymentsState;

    default:
      return state;
  }
}

export function selectPayments(state: PaymentsState): readonly PaymentEntry[] {
  return state.entries;
}

export function hasPayments(state: PaymentsState): boolean {
  return state.entries.length > 0;
}

export const PAYMENT_PHASE_LABELS: Record<PaymentPhase, string> = {
  idle: "Idle",
  pending: "Pending",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function selectLatestEntry(state: PaymentsState): PaymentEntry | null {
  return state.entries.length > 0 ? (state.entries[state.entries.length - 1] ?? null) : null;
}

/**
 * The canonical confirmed history used for daily accounting and persistence.
 * Derived from store entries — never maintained as a second copy.
 */
export function selectConfirmedPayments(state: PaymentsState): readonly ConfirmedPayment[] {
  return state.entries
    .map((entry) => toConfirmedPayment(entry))
    .filter((record): record is ConfirmedPayment => record !== null);
}

export function selectLatestConfirmed(state: PaymentsState): ConfirmedPayment | null {
  const confirmed = selectConfirmedPayments(state);
  return confirmed.length > 0 ? (confirmed[confirmed.length - 1] ?? null) : null;
}

export function selectEntryById(state: PaymentsState, id: string | null): PaymentEntry | null {
  if (!id) return null;
  return state.entries.find((entry) => entry.id === id) ?? null;
}

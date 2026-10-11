import type { EvmAddress, PaymentIntent, TransactionHash, TrustedPayment } from "@/types";

/**
 * The trusted ledger repository.
 *
 * This interface is the ONLY abstraction the server uses to read/write trusted
 * payment data. Browser storage never satisfies it, so the authoritative ledger
 * cannot be reached from client code.
 */
export interface TrustedPersistenceDescriptor {
  kind: "postgres" | "in-memory";
  /** Whether records survive a restart / serverless cold start. */
  durable: boolean;
  label: string;
  note: string;
}

export interface InsertPaymentResult {
  record: TrustedPayment;
  /** False when an existing record for the same txHash was returned. */
  created: boolean;
}

export interface TrustedPaymentRepository {
  readonly persistence: TrustedPersistenceDescriptor;

  createIntent(intent: PaymentIntent): Promise<void>;
  getIntent(id: string): Promise<PaymentIntent | null>;
  consumeIntent(id: string, txHash: TransactionHash, at: string): Promise<void>;

  findByTxHash(txHash: TransactionHash): Promise<TrustedPayment | null>;
  findById(id: string): Promise<TrustedPayment | null>;
  findByIntentId(intentId: string): Promise<TrustedPayment | null>;
  findConfirmedPaymentForRequest(agentId: string, serviceId: string, ownerWalletAddress: string, amount: number, currency: string): Promise<TrustedPayment | null>;
  /** Idempotent: the same txHash can never create a second record. */
  insertPayment(record: TrustedPayment): Promise<InsertPaymentResult>;
  listPayments(): Promise<TrustedPayment[]>;
  clearAll(): Promise<void>;
}

export const IN_MEMORY_PERSISTENCE: TrustedPersistenceDescriptor = {
  kind: "in-memory",
  durable: false,
  label: "TRUSTED LEDGER (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};

export const POSTGRES_PERSISTENCE: TrustedPersistenceDescriptor = {
  kind: "postgres",
  durable: true,
  label: "TRUSTED SERVER LEDGER",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

/**
 * In-memory reference implementation.
 *
 * Used for tests and as a local development fallback when no `DATABASE_URL` is
 * configured. It enforces the same invariants as the durable adapter, including
 * txHash uniqueness.
 */
export function createInMemoryTrustedRepository(): TrustedPaymentRepository {
  const intents = new Map<string, PaymentIntent>();
  const paymentsByHash = new Map<string, TrustedPayment>();
  const paymentsById = new Map<string, TrustedPayment>();

  function normalizeIntent(intent: PaymentIntent): PaymentIntent {
    return { ...intent, ownerWalletAddress: intent.ownerWalletAddress ?? null };
  }
  function normalizePayment(payment: TrustedPayment): TrustedPayment {
    return { ...payment, ownerWalletAddress: payment.ownerWalletAddress ?? null };
  }

  return {
    persistence: IN_MEMORY_PERSISTENCE,

    async createIntent(intent) {
      if (intents.has(intent.id)) {
        throw new Error("Duplicate intent id.");
      }
      intents.set(intent.id, normalizeIntent(intent));
    },

    async getIntent(id) {
      const intent = intents.get(id);
      return intent ? normalizeIntent(intent) : null;
    },

    async consumeIntent(id, txHash, at) {
      const intent = intents.get(id);
      if (!intent) return;
      intents.set(id, { ...intent, status: "consumed", txHash, expiresAt: intent.expiresAt, createdAt: at });
    },

    async findByTxHash(txHash) {
      const payment = paymentsByHash.get(txHash.toLowerCase());
      return payment ? normalizePayment(payment) : null;
    },

    async findById(id) {
      const payment = paymentsById.get(id);
      return payment ? normalizePayment(payment) : null;
    },

    async findByIntentId(intentId) {
      for (const payment of paymentsById.values()) {
        const normalized = normalizePayment(payment);
        if (normalized.intentId === intentId) {
          return normalized;
        }
      }
      return null;
    },

    async findConfirmedPaymentForRequest(agentId, serviceId, ownerWalletAddress, amount, currency) {
      for (const payment of paymentsById.values()) {
        const normalized = normalizePayment(payment);
        if (
          normalized.agentId === agentId &&
          normalized.serviceId === serviceId &&
          normalized.status === "confirmed" &&
          normalized.recipient === ownerWalletAddress &&
          normalized.amount.amount === amount &&
          normalized.currency === currency
        ) {
          return normalized;
        }
      }
      return null;
    },

    async insertPayment(record) {
      const key = record.txHash.toLowerCase();
      const existing = paymentsByHash.get(key);
      if (existing) {
        return { record: normalizePayment(existing), created: false };
      }
      const normalized = normalizePayment(record);
      paymentsByHash.set(key, normalized);
      paymentsById.set(record.id, normalized);
      return { record: normalized, created: true };
    },

    async listPayments() {
      return [...paymentsById.values()].map(normalizePayment).sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
    },

    async clearAll() {
      intents.clear();
      paymentsByHash.clear();
      paymentsById.clear();
    },
  };
}

export function isEvmAddressString(value: string): value is EvmAddress {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

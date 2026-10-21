import type {
  EvmAddress,
  FlowExecutionRecord,
  PaymentIntent,
  TransactionHash,
  TrustedPayment,
} from "@/types";

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

export interface InsertFlowExecutionResult {
  record: FlowExecutionRecord;
  /** False when an existing record for the same txHash was returned. */
  created: boolean;
}

/**
 * Result of the atomic intent settlement (Phase 51.2, L4).
 *
 *  - `"settled"`: the payment was inserted and the intent consumed in one
 *    indivisible operation.
 *  - `"already_recorded"`: the same transaction hash was already recorded
 *    (safe retry); the existing record is returned and the intent is consumed
 *    if it was still pending (heals a legacy insert-without-consume state).
 *  - `"intent_already_settled"`: the intent was already consumed by a
 *    different transaction — nothing was written.
 */
export type SettlementOutcome =
  | { status: "settled"; record: TrustedPayment }
  | { status: "already_recorded"; record: TrustedPayment }
  | { status: "intent_already_settled" };

export interface TrustedPaymentRepository {
  readonly persistence: TrustedPersistenceDescriptor;

  createIntent(intent: PaymentIntent): Promise<void>;
  getIntent(id: string): Promise<PaymentIntent | null>;
  /**
   * Consume a pending intent. Conditional (Phase 51.2, L4): an intent that is
   * missing or already consumed is left untouched. Settlement flows must use
   * {@link settleIntent}, which makes persistence and consumption atomic.
   */
  consumeIntent(id: string, txHash: TransactionHash, at: string): Promise<void>;

  findByTxHash(txHash: TransactionHash): Promise<TrustedPayment | null>;
  findById(id: string): Promise<TrustedPayment | null>;
  findByIntentId(intentId: string): Promise<TrustedPayment | null>;
  findConfirmedPaymentForRequest(agentId: string, serviceId: string, ownerWalletAddress: string, amount: number, currency: string): Promise<TrustedPayment | null>;
  /** Idempotent: the same txHash can never create a second record. */
  insertPayment(record: TrustedPayment): Promise<InsertPaymentResult>;
  listPayments(): Promise<TrustedPayment[]>;

  /**
   * Atomically settle an intent (Phase 51.2, L4): insert the payment record
   * and consume the intent, or report a typed conflict. Enforces both
   * settlement invariants:
   *  - at most one payment settles a given intent;
   *  - a payment record never persists unless that intent is (or gets) consumed.
   */
  settleIntent(input: { intentId: string; record: TrustedPayment }): Promise<SettlementOutcome>;

  findFlowExecutionByTxHash(txHash: TransactionHash): Promise<FlowExecutionRecord | null>;
  /** Idempotent: the same txHash can never create a second flow-execution record. */
  insertFlowExecution(record: FlowExecutionRecord): Promise<InsertFlowExecutionResult>;
  listFlowExecutions(): Promise<FlowExecutionRecord[]>;

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
  const flowExecutionsByHash = new Map<string, FlowExecutionRecord>();
  const flowExecutionsById = new Map<string, FlowExecutionRecord>();

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
      // Conditional (Phase 51.2, L4): never re-consume or force-consume an
      // intent that is missing or already settled.
      const intent = intents.get(id);
      if (!intent || intent.status !== "pending") return;
      intents.set(id, { ...intent, status: "consumed", txHash, expiresAt: intent.expiresAt, createdAt: at });
    },

    async settleIntent({ intentId, record }) {
      // Phase 51.2 (L4) — atomic in-memory settlement. Claiming the intent and
      // inserting the payment happen in one synchronous critical section (no
      // await between them), so single-threaded JS cannot interleave two
      // competing settlements: exactly one wins, the loser reports
      // "intent_already_settled" without writing anything.
      const canonical = normalizePayment({
        ...record,
        txHash: record.txHash.toLowerCase() as TrustedPayment["txHash"],
      });

      // Safe retry: the same hash is already recorded — still claim the intent
      // if it is pending, healing a legacy insert-without-consume state.
      const existing = paymentsByHash.get(canonical.txHash);
      if (existing) {
        const pendingIntent = intents.get(intentId);
        if (pendingIntent && pendingIntent.status === "pending") {
          intents.set(intentId, {
            ...pendingIntent,
            status: "consumed",
            txHash: existing.txHash,
            expiresAt: pendingIntent.expiresAt,
            createdAt: pendingIntent.createdAt,
          });
        }
        return { status: "already_recorded", record: normalizePayment(existing) };
      }

      const intent = intents.get(intentId);
      if (!intent || intent.status !== "pending") {
        return { status: "intent_already_settled" };
      }
      intents.set(intentId, {
        ...intent,
        status: "consumed",
        txHash: canonical.txHash,
        expiresAt: intent.expiresAt,
        createdAt: intent.createdAt,
      });
      paymentsByHash.set(canonical.txHash, canonical);
      paymentsById.set(canonical.id, canonical);
      return { status: "settled", record: canonical };
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
      // Canonicalise before storing (Phase 50.3): the uniqueness key and the
      // persisted record use the lowercase hash, so a letter-case variant of
      // an already recorded transaction returns the existing record.
      const canonical = normalizePayment({
        ...record,
        txHash: record.txHash.toLowerCase() as TrustedPayment["txHash"],
      });
      const existing = paymentsByHash.get(canonical.txHash);
      if (existing) {
        return { record: normalizePayment(existing), created: false };
      }
      paymentsByHash.set(canonical.txHash, canonical);
      paymentsById.set(canonical.id, canonical);
      return { record: canonical, created: true };
    },

    async listPayments() {
      return [...paymentsById.values()].map(normalizePayment).sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
    },

    async findFlowExecutionByTxHash(txHash) {
      const record = flowExecutionsByHash.get(txHash.toLowerCase());
      return record ?? null;
    },

    async insertFlowExecution(record) {
      // Canonicalise before storing: the uniqueness key and the persisted
      // record use the lowercase hash, so a letter-case variant of an already
      // recorded transaction returns the existing record.
      const canonical: FlowExecutionRecord = {
        ...record,
        txHash: record.txHash.toLowerCase() as FlowExecutionRecord["txHash"],
      };
      const existing = flowExecutionsByHash.get(canonical.txHash);
      if (existing) {
        return { record: existing, created: false };
      }
      flowExecutionsByHash.set(canonical.txHash, canonical);
      flowExecutionsById.set(canonical.id, canonical);
      return { record: canonical, created: true };
    },

    async listFlowExecutions() {
      return [...flowExecutionsById.values()].sort((a, b) =>
        a.confirmedAt.localeCompare(b.confirmedAt),
      );
    },

    async clearAll() {
      intents.clear();
      paymentsByHash.clear();
      paymentsById.clear();
      flowExecutionsByHash.clear();
      flowExecutionsById.clear();
    },
  };
}

export function isEvmAddressString(value: string): value is EvmAddress {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

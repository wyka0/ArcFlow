import { Pool } from "pg";

import type { EvmAddress, PaymentIntent, TrustedPayment } from "@/types";

import {
  POSTGRES_PERSISTENCE,
  type InsertPaymentResult,
  type TrustedPaymentRepository,
} from "./repository";

interface PoolConfigExtended {
  connectionString?: string;
  max?: number;
  statement_cache_size?: number;
  [key: string]: unknown;
}

/**
 * Durable PostgreSQL adapter for the trusted ledger.
 *
 * This is the production-grade option: records live outside browser storage and
 * survive restarts and serverless cold starts. `tx_hash` is a UNIQUE constraint,
 * so the same transaction can never be counted twice even under concurrency.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agentpay_payment_intents (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  sender TEXT,
  recipient TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  amount_base_units TEXT NOT NULL,
  currency TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  owner_wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS agentpay_trusted_payments (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  amount_base_units TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  block_number TEXT NOT NULL,
  owner_wallet_address TEXT,
  intent_id TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Add intent_id column if it doesn't exist (migration for existing deployments)
ALTER TABLE agentpay_trusted_payments ADD COLUMN IF NOT EXISTS intent_id TEXT;

CREATE INDEX IF NOT EXISTS agentpay_payment_intents_owner_idx
  ON agentpay_payment_intents (owner_wallet_address);
CREATE INDEX IF NOT EXISTS agentpay_trusted_payments_owner_idx
  ON agentpay_trusted_payments (owner_wallet_address);
`;

interface IntentRow {
  id: string;
  agent_id: string;
  service_id: string;
  service_name: string;
  sender: string | null;
  recipient: string;
  amount: string;
  amount_base_units: string;
  currency: string;
  chain_id: number;
  token_address: string;
  status: string;
  tx_hash: string | null;
  owner_wallet_address: string | null;
  created_at: Date;
  expires_at: Date;
}

interface PaymentRow {
  id: string;
  tx_hash: string;
  chain_id: number;
  token_address: string;
  agent_id: string;
  service_id: string;
  service_name: string;
  sender: string;
  recipient: string;
  amount: string;
  amount_base_units: string;
  currency: string;
  status: string;
  block_number: string;
  owner_wallet_address: string | null;
  confirmed_at: Date;
  created_at: Date;
  intent_id: string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToIntent(row: IntentRow): PaymentIntent {
  return {
    id: row.id,
    agentId: row.agent_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    sender: (row.sender as EvmAddress | null) ?? null,
    recipient: row.recipient as EvmAddress,
    amount: { amount: Number(row.amount), currency: "USDC" },
    amountBaseUnits: row.amount_base_units,
    currency: "USDC",
    chainId: row.chain_id,
    tokenAddress: row.token_address as EvmAddress,
    status: row.status === "consumed" ? "consumed" : "pending",
    txHash: (row.tx_hash as PaymentIntent["txHash"]) ?? null,
    ownerWalletAddress: (row.owner_wallet_address as EvmAddress | null) ?? null,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

function rowToPayment(row: PaymentRow): TrustedPayment {
  return {
    id: row.id,
    txHash: row.tx_hash as TrustedPayment["txHash"],
    chainId: row.chain_id,
    tokenAddress: row.token_address as EvmAddress,
    agentId: row.agent_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    sender: row.sender as EvmAddress,
    recipient: row.recipient as EvmAddress,
    amount: { amount: Number(row.amount), currency: "USDC" },
    currency: "USDC",
    amountBaseUnits: row.amount_base_units,
    status: "confirmed",
    blockNumber: row.block_number,
    ownerWalletAddress: (row.owner_wallet_address as EvmAddress | null) ?? null,
    confirmedAt: toIso(row.confirmed_at),
    createdAt: toIso(row.created_at),
    intentId: row.intent_id ?? null,
  };
}

export function createPostgresTrustedRepository(connectionString: string): TrustedPaymentRepository {
  const looksPooled = connectionString.includes("-pooler.") || connectionString.includes("pgbouncer") || connectionString.includes("pooler");
  console.log("[DATABASE_SELECTION] { source: \"trusted-ledger\", present: true, looksPooled: " + looksPooled + " }");
  const pool = new Pool({ connectionString, max: 5, statement_cache_size: 0 } as PoolConfigExtended);
  let schemaReady: Promise<void> | null = null;

  function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = pool.query(SCHEMA).then(
        () => undefined,
        (error) => {
          schemaReady = null;
          throw error;
        },
      );
    }
    return schemaReady;
  }

  async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    await ensureSchema();
    const config = { text, values };
    const result = await pool.query(config);
    return result.rows as T[];
  }

  return {
    persistence: POSTGRES_PERSISTENCE,

    async createIntent(intent) {
      await query(
        `INSERT INTO agentpay_payment_intents
          (id, agent_id, service_id, service_name, sender, recipient, amount, amount_base_units,
           currency, chain_id, token_address, status, tx_hash, owner_wallet_address, created_at, expires_at)
         VALUES (
           $1, $2, $3::text, $4, $5::text, $6, $7::numeric, $8, $9, $10::integer,
           $11, $12, $13::text, $14::text, $15::timestamptz, $16::timestamptz
         )`,
        [
          intent.id,
          intent.agentId,
          intent.serviceId,
          intent.serviceName,
          intent.sender,
          intent.recipient,
          intent.amount.amount,
          intent.amountBaseUnits,
          intent.currency,
          intent.chainId,
          intent.tokenAddress,
          intent.status,
          intent.txHash,
          intent.ownerWalletAddress,
          intent.createdAt,
          intent.expiresAt,
        ],
      );
    },

    async getIntent(id) {
      const rows = await query<IntentRow>(
        `SELECT * FROM agentpay_payment_intents WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? rowToIntent(rows[0]) : null;
    },

    async consumeIntent(id, txHash, at) {
      await query(
        `UPDATE agentpay_payment_intents SET status = 'consumed', tx_hash = $2 WHERE id = $1`,
        [id, txHash],
      );
      void at;
    },

    async findByTxHash(txHash) {
      const rows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments WHERE lower(tx_hash) = lower($1) LIMIT 1`,
        [txHash],
      );
      return rows[0] ? rowToPayment(rows[0]) : null;
    },

    async findById(id) {
      const rows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? rowToPayment(rows[0]) : null;
    },

    async findByIntentId(intentId) {
      // First try to find by intent_id (for new payments)
      const rows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments WHERE intent_id = $1 LIMIT 1`,
        [intentId],
      );
      if (rows[0]) return rowToPayment(rows[0]);

      // Fallback 1: find by agent_id and service_id matching the intent
      // This handles existing payments created before the intent_id column was added
      const intentRows = await query<PaymentRow>(
        `SELECT * FROM agentpay_payment_intents WHERE id = $1 LIMIT 1`,
        [intentId],
      );
      if (!intentRows[0]) return null;

      const intent = intentRows[0];
      const fallbackRows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments 
         WHERE agent_id = $1 AND service_id = $2 AND (intent_id IS NULL OR intent_id = $3)
         ORDER BY confirmed_at DESC LIMIT 1`,
        [intent.agent_id, intent.service_id, intentId],
      );
      if (fallbackRows[0]) return rowToPayment(fallbackRows[0]);

      // Fallback 2: find by tx_hash from the consumed intent
      // This handles payments where the intent was consumed but intent_id wasn't propagated
      if (intent.tx_hash) {
        const txHashRows = await query<PaymentRow>(
          `SELECT * FROM agentpay_trusted_payments WHERE lower(tx_hash) = lower($1) LIMIT 1`,
          [intent.tx_hash],
        );
        if (txHashRows[0]) return rowToPayment(txHashRows[0]);
      }

      return null;
    },

    async findConfirmedPaymentForRequest(agentId, serviceId, ownerWalletAddress, amount, currency) {
      const rows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments 
         WHERE agent_id = $1 AND service_id = $2 AND status = 'confirmed'
         AND recipient = $3 AND amount = $4 AND currency = $5
         ORDER BY confirmed_at DESC LIMIT 1`,
        [agentId, serviceId, ownerWalletAddress, amount.toString(), currency],
      );
      return rows[0] ? rowToPayment(rows[0]) : null;
    },

    async insertPayment(record): Promise<InsertPaymentResult> {
      const inserted = await query<PaymentRow>(
        `INSERT INTO agentpay_trusted_payments
          (id, tx_hash, chain_id, token_address, agent_id, service_id, service_name, sender,
           recipient, amount, amount_base_units, currency, status, block_number, owner_wallet_address, intent_id, confirmed_at, created_at)
         VALUES (
           $1, $2, $3::integer, $4, $5, $6::text, $7, $8, $9,
           $10::numeric, $11, $12, $13, $14, $15, $16, $17::timestamptz, $18::timestamptz
         )
         ON CONFLICT (tx_hash) DO NOTHING
         RETURNING *`,
        [
          record.id,
          record.txHash,
          record.chainId,
          record.tokenAddress,
          record.agentId,
          record.serviceId,
          record.serviceName,
          record.sender,
          record.recipient,
          record.amount.amount,
          record.amountBaseUnits,
          record.currency,
          record.status,
          record.blockNumber,
          record.ownerWalletAddress,
          record.intentId,
          record.confirmedAt,
          record.createdAt,
        ],
      );

      if (inserted[0]) {
        return { record: rowToPayment(inserted[0]), created: true };
      }

      const existing = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments WHERE lower(tx_hash) = lower($1) LIMIT 1`,
        [record.txHash],
      );
      if (!existing[0]) {
        throw new Error("Insert conflicted but no existing record was found.");
      }
      return { record: rowToPayment(existing[0]), created: false };
    },

    async listPayments() {
      const rows = await query<PaymentRow>(
        `SELECT * FROM agentpay_trusted_payments ORDER BY confirmed_at ASC`,
      );
      return rows.map(rowToPayment);
    },

    async clearAll() {
      await query(`DELETE FROM agentpay_trusted_payments`);
      await query(`DELETE FROM agentpay_payment_intents`);
    },
  };
}

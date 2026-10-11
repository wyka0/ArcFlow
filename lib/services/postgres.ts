import { Pool } from "pg";

import type { EvmAddress, TransactionHash } from "@/types";
import type { ServiceRequest, ServiceResult, ServiceRequestStatus } from "@/types/service-request";

import {
  type ServiceRequestRepository,
  type ServiceResultRepository,
} from "./repository";

interface PoolConfigExtended {
  connectionString?: string;
  max?: number;
  statement_cache_size?: number;
  [key: string]: unknown;
}

/**
 * Durable PostgreSQL adapter for service requests and results.
 *
 * This is the production-grade option: records live outside browser storage and
 * survive restarts and serverless cold starts.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agentpay_service_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  input JSONB NOT NULL,
  payment_intent_id TEXT,
  trusted_payment_id TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  fulfilled_at TIMESTAMPTZ,
  owner_wallet_address TEXT,
  idempotency_key TEXT
);

CREATE TABLE IF NOT EXISTS agentpay_service_results (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL,
  output JSONB,
  error TEXT,
  trusted_payment_id TEXT NOT NULL,
  fulfilled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agentpay_service_requests_owner_idx
  ON agentpay_service_requests (owner_wallet_address);
CREATE INDEX IF NOT EXISTS agentpay_service_requests_agent_idx
  ON agentpay_service_requests (agent_id);
CREATE INDEX IF NOT EXISTS agentpay_service_requests_status_idx
  ON agentpay_service_requests (status);
CREATE INDEX IF NOT EXISTS agentpay_service_requests_payment_intent_idx
  ON agentpay_service_requests (payment_intent_id);
CREATE INDEX IF NOT EXISTS agentpay_service_results_request_idx
  ON agentpay_service_results (request_id);
`;

interface ServiceRequestRow {
  id: string;
  agent_id: string;
  service_id: string;
  service_name: string;
  input: Record<string, unknown>;
  payment_intent_id: string | null;
  trusted_payment_id: string | null;
  tx_hash: string | null;
  status: string;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  fulfilled_at: Date | null;
  owner_wallet_address: string | null;
  idempotency_key: string | null;
}

interface ServiceResultRow {
  id: string;
  request_id: string;
  service_id: string;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  trusted_payment_id: string;
  fulfilled_at: Date;
  created_at: Date;
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToRequest(row: ServiceRequestRow): ServiceRequest {
  return {
    id: row.id,
    agentId: row.agent_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    input: row.input,
    paymentIntentId: row.payment_intent_id,
    trustedPaymentId: row.trusted_payment_id,
    txHash: (row.tx_hash as TransactionHash | null) ?? null,
    status: row.status as ServiceRequestStatus,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    fulfilledAt: toIso(row.fulfilled_at),
    ownerWalletAddress: (row.owner_wallet_address as EvmAddress | null) ?? null,
    idempotencyKey: row.idempotency_key,
  };
}

function rowToResult(row: ServiceResultRow): ServiceResult {
  return {
    id: row.id,
    requestId: row.request_id,
    serviceId: row.service_id,
    status: row.status as "fulfilled" | "failed",
    output: row.output,
    error: row.error,
    trustedPaymentId: row.trusted_payment_id,
    fulfilledAt: row.fulfilled_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

export function createPostgresServiceRequestRepository(connectionString: string) {
  const looksPooled = connectionString.includes("-pooler.") || connectionString.includes("pgbouncer") || connectionString.includes("pooler");
  console.log("[DATABASE_SELECTION] { source: \"service-request\", present: true, looksPooled: " + looksPooled + " }");
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
    descriptor: {
      kind: "postgres" as const,
      durable: true,
      label: "SERVICE REQUEST REPOSITORY (POSTGRES)",
      note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
    },

    async create(request: ServiceRequest) {
      await query(
        `INSERT INTO agentpay_service_requests
          (id, agent_id, service_id, service_name, input, payment_intent_id, trusted_payment_id, tx_hash, status, error, created_at, updated_at, fulfilled_at, owner_wallet_address, idempotency_key)
         VALUES (
           $1, $2, $3::text, $4, $5::jsonb, $6, $7, $8, $9, $10,
           $11::timestamptz, $12::timestamptz, $13::timestamptz, $14, $15
         )`,
        [
          request.id,
          request.agentId,
          request.serviceId,
          request.serviceName,
          JSON.stringify(request.input),
          request.paymentIntentId,
          request.trustedPaymentId,
          request.txHash,
          request.status,
          request.error,
          request.createdAt,
          request.updatedAt,
          request.fulfilledAt,
          request.ownerWalletAddress,
          request.idempotencyKey,
        ],
      );
    },

    async getById(id: string) {
      const rows = await query<ServiceRequestRow>(
        `SELECT * FROM agentpay_service_requests WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? rowToRequest(rows[0]) : null;
    },

    async getByAgentAndService(agentId: string, serviceId: string) {
      const rows = await query<ServiceRequestRow>(
        `SELECT * FROM agentpay_service_requests WHERE agent_id = $1 AND service_id = $2 ORDER BY created_at ASC`,
        [agentId, serviceId],
      );
      return rows.map(rowToRequest);
    },

    async getByIdempotencyKey(agentId: string, idempotencyKey: string) {
      const rows = await query<ServiceRequestRow>(
        `SELECT * FROM agentpay_service_requests WHERE agent_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [agentId, idempotencyKey],
      );
      return rows[0] ? rowToRequest(rows[0]) : null;
    },

    async update(request: ServiceRequest) {
      await query(
        `UPDATE agentpay_service_requests
         SET service_id = $2::text, service_name = $3, input = $4::jsonb, payment_intent_id = $5, trusted_payment_id = $6,
             tx_hash = $7, status = $8, error = $9, updated_at = $10::timestamptz, fulfilled_at = $11::timestamptz,
             owner_wallet_address = $12, idempotency_key = $13
         WHERE id = $1`,
        [
          request.id,
          request.serviceId,
          request.serviceName,
          JSON.stringify(request.input),
          request.paymentIntentId,
          request.trustedPaymentId,
          request.txHash,
          request.status,
          request.error,
          request.updatedAt,
          request.fulfilledAt,
          request.ownerWalletAddress,
          request.idempotencyKey,
        ],
      );
    },

    async listAll() {
      const rows = await query<ServiceRequestRow>(
        `SELECT * FROM agentpay_service_requests ORDER BY created_at ASC`,
      );
      return rows.map(rowToRequest);
    },

    async clearAll() {
      await query(`DELETE FROM agentpay_service_results`);
      await query(`DELETE FROM agentpay_service_requests`);
    },

    // Service Result methods
    async createResult(result: ServiceResult) {
      await query(
        `INSERT INTO agentpay_service_results
          (id, request_id, service_id, status, output, error, trusted_payment_id, fulfilled_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          result.id,
          result.requestId,
          result.serviceId,
          result.status,
          result.output ? JSON.stringify(result.output) : null,
          result.error,
          result.trustedPaymentId,
          result.fulfilledAt,
          result.createdAt,
        ],
      );
    },

    async getResultByRequestId(requestId: string) {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results WHERE request_id = $1 LIMIT 1`,
        [requestId],
      );
      return rows[0] ? rowToResult(rows[0]) : null;
    },

    async getResultByTrustedPaymentId(trustedPaymentId: string) {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results WHERE trusted_payment_id = $1 LIMIT 1`,
        [trustedPaymentId],
      );
      return rows[0] ? rowToResult(rows[0]) : null;
    },

    async listAllResults() {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results ORDER BY created_at ASC`,
      );
      return rows.map(rowToResult);
    },
  };
}

export function createPostgresServiceResultRepository(connectionString: string) {
  const looksPooled = connectionString.includes("-pooler.") || connectionString.includes("pgbouncer") || connectionString.includes("pooler");
  console.log("[DATABASE_SELECTION] { source: \"service-result\", present: true, looksPooled: " + looksPooled + " }");
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

  function rowToResult(row: ServiceResultRow): ServiceResult {
    return {
      id: row.id,
      requestId: row.request_id,
      serviceId: row.service_id,
      status: row.status as "fulfilled" | "failed",
      output: row.output,
      error: row.error,
      trustedPaymentId: row.trusted_payment_id,
      fulfilledAt: row.fulfilled_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  function toIso(value: Date | string | null): string | null {
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  return {
    descriptor: {
      kind: "postgres" as const,
      durable: true,
      label: "SERVICE RESULT REPOSITORY (POSTGRES)",
      note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
    },

    // Legacy method names (for backward compatibility)
    async create(result: ServiceResult) {
      return this.createResult(result);
    },

    async getByRequestId(requestId: string) {
      return this.getResultByRequestId(requestId);
    },

    async getByTrustedPaymentId(trustedPaymentId: string) {
      return this.getResultByTrustedPaymentId(trustedPaymentId);
    },

    async listAll() {
      return this.listAllResults();
    },

    async createResult(result: ServiceResult) {
      await query(
        `INSERT INTO agentpay_service_results
          (id, request_id, service_id, status, output, error, trusted_payment_id, fulfilled_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          result.id,
          result.requestId,
          result.serviceId,
          result.status,
          result.output ? JSON.stringify(result.output) : null,
          result.error,
          result.trustedPaymentId,
          result.fulfilledAt,
          result.createdAt,
        ],
      );
    },

    async getResultByRequestId(requestId: string) {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results WHERE request_id = $1 LIMIT 1`,
        [requestId],
      );
      return rows[0] ? rowToResult(rows[0]) : null;
    },

    async getResultByTrustedPaymentId(trustedPaymentId: string) {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results WHERE trusted_payment_id = $1 LIMIT 1`,
        [trustedPaymentId],
      );
      return rows[0] ? rowToResult(rows[0]) : null;
    },

    async listAllResults() {
      const rows = await query<ServiceResultRow>(
        `SELECT * FROM agentpay_service_results ORDER BY created_at ASC`,
      );
      return rows.map(rowToResult);
    },

    async clearAll() {
      await query(`DELETE FROM agentpay_service_results`);
      await query(`DELETE FROM agentpay_service_requests`);
    },
  };
}

export const POSTGRES_SERVICE_REQUEST_DESCRIPTOR = {
  kind: "postgres" as const,
  durable: true,
  label: "SERVICE REQUEST REPOSITORY (POSTGRES)",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

export const IN_MEMORY_SERVICE_REQUEST_DESCRIPTOR = {
  kind: "in-memory" as const,
  durable: false,
  label: "SERVICE REQUEST REPOSITORY (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};

export const POSTGRES_SERVICE_RESULT_DESCRIPTOR = {
  kind: "postgres" as const,
  durable: true,
  label: "SERVICE RESULT REPOSITORY (POSTGRES)",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

export const IN_MEMORY_SERVICE_RESULT_DESCRIPTOR = {
  kind: "in-memory" as const,
  durable: false,
  label: "SERVICE RESULT REPOSITORY (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};
import { Pool } from "pg";

import type { AgentIdentity } from "@/types/agent";

import {
  IN_MEMORY_AGENT_DESCRIPTOR,
  POSTGRES_AGENT_DESCRIPTOR,
  type AgentRepository,
} from "./repository";

interface PoolConfigExtended {
  connectionString?: string;
  max?: number;
  statement_cache_size?: number;
  [key: string]: unknown;
}

/**
 * Durable PostgreSQL adapter for the agent registry.
 *
 * This is the production-grade option: records live outside browser storage and
 * survive restarts and serverless cold starts.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agentpay_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  owner_wallet_address TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agentpay_agents_owner_idx
  ON agentpay_agents (owner_wallet_address);
CREATE INDEX IF NOT EXISTS agentpay_agents_api_key_hash_idx
  ON agentpay_agents (api_key_hash);
`;

interface AgentRow {
  id: string;
  name: string;
  description: string;
  owner_wallet_address: string;
  api_key_hash: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToAgent(row: AgentRow): AgentIdentity {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerWalletAddress: row.owner_wallet_address as `0x${string}`,
    apiKeyHash: row.api_key_hash,
    status: row.status as "active" | "disabled",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function createPostgresAgentRepository(connectionString: string): AgentRepository {
  const looksPooled = connectionString.includes("-pooler.") || connectionString.includes("pgbouncer") || connectionString.includes("pooler");
  console.log("[DATABASE_SELECTION] { source: \"agent-registry\", present: true, looksPooled: " + looksPooled + " }");
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
    descriptor: POSTGRES_AGENT_DESCRIPTOR,

    async create(agent) {
      await query(
        `INSERT INTO agentpay_agents
          (id, name, description, owner_wallet_address, api_key_hash, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          agent.id,
          agent.name,
          agent.description,
          agent.ownerWalletAddress,
          agent.apiKeyHash,
          agent.status,
          agent.createdAt,
          agent.updatedAt,
        ],
      );
    },

    async getById(id) {
      const rows = await query<AgentRow>(
        `SELECT * FROM agentpay_agents WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? rowToAgent(rows[0]) : null;
    },

    async getByApiKeyHash(apiKeyHash) {
      const rows = await query<AgentRow>(
        `SELECT * FROM agentpay_agents WHERE api_key_hash = $1 LIMIT 1`,
        [apiKeyHash],
      );
      return rows[0] ? rowToAgent(rows[0]) : null;
    },

    async getByOwnerWallet(ownerWalletAddress) {
      const rows = await query<AgentRow>(
        `SELECT * FROM agentpay_agents WHERE owner_wallet_address = $1 ORDER BY created_at ASC`,
        [ownerWalletAddress.toLowerCase()],
      );
      return rows.map(rowToAgent);
    },

    async update(agent) {
      await query(
        `UPDATE agentpay_agents
         SET name = $2, description = $3, api_key_hash = $4, status = $5, updated_at = $6
         WHERE id = $1`,
        [
          agent.id,
          agent.name,
          agent.description,
          agent.apiKeyHash,
          agent.status,
          agent.updatedAt,
        ],
      );
    },

    async listAll() {
      const rows = await query<AgentRow>(
        `SELECT * FROM agentpay_agents ORDER BY created_at ASC`,
      );
      return rows.map(rowToAgent);
    },

    async clearAll() {
      await query(`DELETE FROM agentpay_agents`);
    },
  };
}
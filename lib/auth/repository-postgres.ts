import type { Address } from "viem";

import {
  POSTGRES_AUTH_PERSISTENCE,
  type AuthSessionRepository,
  type AuthenticatedSession,
} from "./repository";

interface PoolConfigExtended {
  connectionString?: string;
  max?: number;
  statement_cache_size?: number;
  [key: string]: unknown;
}

/**
 * Durable PostgreSQL adapter for auth sessions.
 *
 * The session table lives next to the trusted ledger. The unique constraint on
 * `id` makes lookups exact; the `wallet_address` index makes per-wallet
 * lookups fast; the explicit `expires_at` makes the TTL auditable.
 *
 * `findById` and `findByWallet` filter out expired sessions in SQL so callers
 * never have to interpret a stale row.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agentpay_auth_sessions (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agentpay_auth_sessions_wallet_idx
  ON agentpay_auth_sessions (wallet_address);
`;

interface SessionRow {
  id: string;
  wallet_address: string;
  created_at: Date;
  expires_at: Date;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToSession(row: SessionRow): AuthenticatedSession {
  return {
    id: row.id,
    walletAddress: row.wallet_address as Address,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

export function createPostgresAuthSessionRepository(connectionString: string): AuthSessionRepository {
  // Lazy-load pg so the in-memory path never pulls it in.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg") as typeof import("pg");
  const looksPooled = connectionString.includes("-pooler.") || connectionString.includes("pgbouncer") || connectionString.includes("pooler");
  console.log("[DATABASE_SELECTION] { source: \"auth-session\", present: true, looksPooled: " + looksPooled + " }");
  const pool = new Pool({ connectionString, max: 5, statement_cache_size: 0 } as PoolConfigExtended);
  let schemaReady: Promise<void> | null = null;

  function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = pool.query(SCHEMA).then(
        () => undefined,
        (error: unknown) => {
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
    persistence: POSTGRES_AUTH_PERSISTENCE,

    async create(session) {
      await query(
        `INSERT INTO agentpay_auth_sessions (id, wallet_address, created_at, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET wallet_address = EXCLUDED.wallet_address,
               created_at = EXCLUDED.created_at,
               expires_at = EXCLUDED.expires_at`,
        [session.id, session.walletAddress, session.createdAt, session.expiresAt],
      );
      return session;
    },

    async findById(id) {
      const rows = await query<SessionRow>(
        `SELECT * FROM agentpay_auth_sessions
         WHERE id = $1 AND expires_at > now()
         LIMIT 1`,
        [id],
      );
      return rows[0] ? rowToSession(rows[0]) : null;
    },

    async findByWallet(walletAddress: Address) {
      const rows = await query<SessionRow>(
        `SELECT * FROM agentpay_auth_sessions
         WHERE lower(wallet_address) = lower($1) AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [walletAddress],
      );
      return rows[0] ? rowToSession(rows[0]) : null;
    },

    async revoke(id) {
      const result = await query<{ id: string }>(
        `DELETE FROM agentpay_auth_sessions WHERE id = $1 RETURNING id`,
        [id],
      );
      return result.length > 0;
    },

    async clearAll() {
      await query(`DELETE FROM agentpay_auth_sessions`);
    },
  };
}

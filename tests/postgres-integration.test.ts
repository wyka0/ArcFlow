import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

import { createPostgresTrustedRepository } from "@/lib/payments/server/postgres";
import { createPostgresAuthSessionRepository } from "@/lib/auth/repository-postgres";
import type { PaymentIntent, TrustedPayment } from "@/types/trusted-payment";
import type { AuthenticatedSession } from "@/lib/auth/repository";

/**
 * Phase 23.12T — PostgreSQL integration tests against an isolated Neon branch.
 *
 * Safety gates:
 *   RUN_POSTGRES_INTEGRATION=1   — operator opt-in
 *   POSTGRES_TEST_URL=<branch connection string> — isolated Neon branch (NOT production)
 *
 * Isolation:
 *   Each run generates a unique RUN_ID used as the agent_id for all test
 *   records. Cleanup targets only records created by this run, preventing
 *   cross-run collisions and stale-data interference.
 *
 * Cleanup:
 *   afterAll deletes records in safe order. Cleanup failures are surfaced
 *   in the test output. Auth-session IDs are tracked explicitly during the
 *   run and deleted by exact ID.
 *
 * This file NEVER falls back to DATABASE_URL or the in-memory adapter.
 */

const RUN = process.env.RUN_POSTGRES_INTEGRATION === "1";
const TEST_URL = process.env.POSTGRES_TEST_URL;
const configured = RUN && typeof TEST_URL === "string" && TEST_URL.startsWith("postgresql://") && TEST_URL.includes(".neon.tech");
const d = configured ? describe : describe.skip;

/** Unique per-run identifier for test data isolation. */
const RUN_ID = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let pool: Pool;
let testRepo: ReturnType<typeof createPostgresTrustedRepository>;
let authRepo: ReturnType<typeof createPostgresAuthSessionRepository>;
const createdSessionIds: string[] = [];

function makeTestIntent(overrides?: Partial<PaymentIntent>): PaymentIntent {
  return {
    id: `${RUN_ID}-intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId: RUN_ID,
    serviceId: "test-service",
    serviceName: "Integration Test Service",
    sender: null,
    recipient: "0xD682a75B581AA237b5A60aDaefD263Ded0065140",
    amount: { amount: 1, currency: "USDC" },
    amountBaseUnits: "1000000",
    currency: "USDC",
    chainId: 5042,
    tokenAddress: "0x3600000000000000000000000000000000000000",
    status: "pending",
    txHash: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ownerWalletAddress: null,
    ...overrides,
  };
}

function makeTestPayment(overrides?: Partial<TrustedPayment>): TrustedPayment {
  return {
    id: `${RUN_ID}-payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    txHash: `0x${Date.now().toString(16).padStart(8, "0")}${Math.random().toString(16).slice(2).padStart(56, "0")}`,
    chainId: 5042,
    tokenAddress: "0x3600000000000000000000000000000000000000",
    agentId: RUN_ID,
    serviceId: "test-service",
    serviceName: "Integration Test Service",
    sender: "0x1111111111111111111111111111111111111111",
    recipient: "0xD682a75B581AA237b5A60aDaefD263Ded0065140",
    amount: { amount: 1, currency: "USDC" },
    amountBaseUnits: "1000000",
    currency: "USDC",
    status: "confirmed",
    blockNumber: "1",
    confirmedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ownerWalletAddress: null,
    intentId: null,
    ...overrides,
  };
}

function makeTestSession(id: string): AuthenticatedSession {
  return {
    id,
    walletAddress: "0x1111111111111111111111111111111111111111",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

d("PostgreSQL integration tests (isolated Neon branch)", () => {
  beforeAll(async () => {
    if (!configured || !TEST_URL) return;

    pool = new Pool({ connectionString: TEST_URL, max: 1 });

    // Safety check: test URL must NOT point to the same host as DATABASE_URL.
    const prodUrl = process.env.DATABASE_URL;
    if (prodUrl) {
      try {
        const testHost = new URL(TEST_URL).hostname;
        const prodHost = new URL(prodUrl).hostname;
        if (testHost === prodHost) {
          throw new Error(
            "SAFETY VIOLATION: POSTGRES_TEST_URL points to the same Neon endpoint as DATABASE_URL. " +
            "Refusing to run integration tests against the production database.",
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("SAFETY VIOLATION")) throw e;
      }
    }

    testRepo = createPostgresTrustedRepository(TEST_URL);
    authRepo = createPostgresAuthSessionRepository(TEST_URL);

    // Trigger each adapter's lazy ensureSchema() so all tables exist
    // before the schema-verification test runs.
    await testRepo.listPayments();
    await authRepo.findById("schema-bootstrap-probe");
  });

  afterAll(async () => {
    if (!pool) return;

    const cleanupErrors: string[] = [];

    try {
      await pool.query("DELETE FROM agentpay_trusted_payments WHERE agent_id = $1", [RUN_ID]);
    } catch (e) {
      cleanupErrors.push(`trusted_payments: ${(e as Error).message}`);
    }
    try {
      await pool.query("DELETE FROM agentpay_payment_intents WHERE agent_id = $1", [RUN_ID]);
    } catch (e) {
      cleanupErrors.push(`payment_intents: ${(e as Error).message}`);
    }
    for (const sessionId of createdSessionIds) {
      try {
        await pool.query("DELETE FROM agentpay_auth_sessions WHERE id = $1", [sessionId]);
      } catch (e) {
        cleanupErrors.push(`auth_sessions[${sessionId.slice(0, 20)}]: ${(e as Error).message}`);
      }
    }
    try {
      await pool.query("DELETE FROM agentpay_auth_sessions WHERE id LIKE $1", [`${RUN_ID}-%`]);
    } catch (e) {
      cleanupErrors.push(`auth_sessions[run-prefix]: ${(e as Error).message}`);
    }
    // Service and agent tables: created by separate adapters not instantiated
    // in this test. Tolerate "does not exist" errors; only report other failures.
    for (const table of ["agentpay_service_requests", "agentpay_service_results"]) {
      try {
        await pool.query(`DELETE FROM ${table} WHERE agent_id = $1`, [RUN_ID]);
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("does not exist")) {
          cleanupErrors.push(`${table}: ${msg}`);
        }
      }
    }
    try {
      await pool.query("DELETE FROM agentpay_agents WHERE api_key_hash LIKE $1", [`${RUN_ID}%`]);
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("does not exist")) {
        cleanupErrors.push(`agentpay_agents: ${msg}`);
      }
    }

    // Phase 23.14: verify cleanup succeeded — count remaining run-scoped records.
    try {
      const checks: Array<{ table: string; col: string; pattern: string }> = [
        { table: "agentpay_payment_intents", col: "agent_id", pattern: RUN_ID },
        { table: "agentpay_trusted_payments", col: "agent_id", pattern: RUN_ID },
        { table: "agentpay_auth_sessions", col: "id", pattern: `${RUN_ID}-%` },
      ];
      for (const { table, col, pattern } of checks) {
        try {
          const result = await pool.query(
            `SELECT COUNT(*) AS remaining FROM ${table} WHERE ${col} LIKE $1`,
            [pattern],
          );
          const remaining = parseInt(result.rows[0]?.remaining ?? "0", 10);
          if (remaining > 0) {
            cleanupErrors.push(`cleanup verification: ${remaining} record(s) remain in ${table}`);
          }
        } catch (e) {
          // Table may not exist (service/agent tables) — tolerate, don't mask real errors.
          const msg = (e as Error).message;
          if (!msg.includes("does not exist")) {
            cleanupErrors.push(`cleanup verification for ${table}: ${msg}`);
          }
        }
      }
    } catch (e) {
      // This outer catch should never fire (inner catch handles per-table errors)
      // but is kept as a safety net.
      cleanupErrors.push(`cleanup verification: ${(e as Error).message}`);
    }

    await pool.end();

    if (cleanupErrors.length > 0) {
      throw new Error(`CLEANUP ERRORS (${cleanupErrors.length}): ${cleanupErrors.join("; ")}`);
    }
  });

  it("connects to the test database and creates the payment schema", async () => {
    const payments = await testRepo.listPayments();
    expect(Array.isArray(payments)).toBe(true);

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'agentpay_%' ORDER BY table_name",
    );
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toContain("agentpay_payment_intents");
    expect(names).toContain("agentpay_trusted_payments");
  });

  it("auth session table exists after the auth adapter is exercised", async () => {
    const sessionId = `${RUN_ID}-schema-verify`;
    const session = makeTestSession(sessionId);
    createdSessionIds.push(session.id);

    await authRepo.create(session);
    const found = await authRepo.findById(session.id);
    expect(found).toBeTruthy();

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agentpay_auth_sessions'",
    );
    expect(tables.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("creates and retrieves a payment intent", async () => {
    const intent = makeTestIntent();
    await testRepo.createIntent(intent);

    const retrieved = await testRepo.getIntent(intent.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.agentId).toBe(RUN_ID);
    expect(retrieved?.amountBaseUnits).toBe("1000000");
  });

  it("consumes a payment intent (single-use)", async () => {
    const intent = makeTestIntent();
    await testRepo.createIntent(intent);

    const txHash = `0x${"cd".repeat(32)}` as `0x${string}`;
    await testRepo.consumeIntent(intent.id, txHash, new Date().toISOString());

    const retrieved = await testRepo.getIntent(intent.id);
    expect(retrieved?.status).toBe("consumed");
    expect(retrieved?.txHash).toBe(txHash);
  });

  it("inserts a trusted payment and enforces UNIQUE tx_hash", async () => {
    const payment = makeTestPayment();
    const result = await testRepo.insertPayment(payment);
    expect(result.created).toBe(true);

    const found = await testRepo.findByTxHash(payment.txHash);
    expect(found).toBeTruthy();
    expect(found?.agentId).toBe(RUN_ID);

    const duplicate = makeTestPayment({ id: `${RUN_ID}-payment-dup`, txHash: payment.txHash });
    const dupResult = await testRepo.insertPayment(duplicate);
    expect(dupResult.created).toBe(false);
  });

  it("creates and retrieves an auth session, then revokes it", async () => {
    const sessionId = `${RUN_ID}-auth-roundtrip`;
    const session = makeTestSession(sessionId);
    createdSessionIds.push(session.id);

    await authRepo.create(session);
    const found = await authRepo.findById(session.id);
    expect(found).toBeTruthy();
    expect(found?.walletAddress).toBe("0x1111111111111111111111111111111111111111");

    await authRepo.revoke(session.id);
    const revoked = await authRepo.findById(session.id);
    expect(revoked).toBeFalsy();
  });

  it("propagates connection errors for a bad connection string", async () => {
    const badRepo = createPostgresTrustedRepository(
      "postgresql://invalid:invalid@localhost:1/nonexistent?connect_timeout=1",
    );
    await expect(badRepo.listPayments()).rejects.toThrow();
  });
});

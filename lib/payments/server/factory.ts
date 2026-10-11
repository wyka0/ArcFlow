import { createInMemoryTrustedRepository, type TrustedPaymentRepository } from "./repository";

export { createInMemoryTrustedRepository, type TrustedPaymentRepository } from "./repository";

/**
 * Chooses the trusted ledger adapter.
 *
 * - `DATABASE_URL` set  → durable PostgreSQL adapter (production path).
 * - otherwise           → in-memory adapter, explicitly marked non-durable.
 *
 * The in-memory fallback never silently pretends to be durable: its descriptor
 * reports `durable: false`, and the API surfaces that to the client.
 */
let singleton: TrustedPaymentRepository | null = null;

export function hasDurableLedger(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getUnpooledDatabaseUrl(): string | undefined {
  // Try Neon unpooled connection strings in order of preference
  // These bypass PgBouncer transaction pooling which doesn't support prepared statements
  return (
    process.env.POSTGRES_URL_NON_POOLING?.trim() ??
    process.env.DATABASE_URL_UNPOOLED?.trim() ??
    process.env.DATABASE_URL?.trim()
  );
}

export async function getTrustedRepository(): Promise<TrustedPaymentRepository> {
  if (singleton) return singleton;

  const url = getUnpooledDatabaseUrl();
  if (url) {
    const { createPostgresTrustedRepository } = await import("./postgres");
    singleton = createPostgresTrustedRepository(url);
  } else {
    singleton = createInMemoryTrustedRepository();
  }

  return singleton;
}

/** Test seam: inject a repository (and reset it afterwards). */
export function setTrustedRepositoryForTesting(repository: TrustedPaymentRepository | null): void {
  singleton = repository;
}

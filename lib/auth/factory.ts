import { createInMemoryAuthSessionRepository } from "./repository-memory";
import type { AuthSessionRepository } from "./repository";

export { createInMemoryAuthSessionRepository } from "./repository-memory";
export type { AuthSessionRepository } from "./repository";

/**
 * Resolves the process-wide auth session repository.
 *
 * The choice mirrors the trusted ledger pattern:
 *  - `DATABASE_URL` set → durable PostgreSQL adapter.
 *  - otherwise        → in-memory adapter, explicitly marked non-durable.
 */
let singleton: AuthSessionRepository | null = null;

export function hasDurableAuth(): boolean {
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

export async function getAuthSessionRepository(): Promise<AuthSessionRepository> {
  if (singleton) return singleton;

  const url = getUnpooledDatabaseUrl();
  if (url) {
    const { createPostgresAuthSessionRepository } = await import("./repository-postgres");
    singleton = createPostgresAuthSessionRepository(url);
  } else {
    singleton = createInMemoryAuthSessionRepository();
  }

  return singleton;
}

/** Test seam: inject a repository (and reset it afterwards). */
export function setAuthSessionRepositoryForTesting(repository: AuthSessionRepository | null): void {
  singleton = repository;
}

import { createInMemoryAgentRepository, type AgentRepository, type AgentRepositoryDescriptor } from "./repository";

export { createInMemoryAgentRepository, type AgentRepository, type AgentRepositoryDescriptor } from "./repository";

/**
 * Chooses the agent registry adapter.
 *
 * - `DATABASE_URL` set  → durable PostgreSQL adapter (production path).
 * - otherwise           → in-memory adapter, explicitly marked non-durable.
 *
 * The in-memory fallback never silently pretends to be durable: its descriptor
 * reports `durable: false`, and the API surfaces that to the client.
 */
let singleton: AgentRepository | null = null;

export function hasDurableAgentRegistry(): boolean {
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

export async function getAgentRepository(): Promise<AgentRepository> {
  if (singleton) return singleton;

  const url = getUnpooledDatabaseUrl();
  if (url) {
    const { createPostgresAgentRepository } = await import("./postgres");
    singleton = createPostgresAgentRepository(url);
  } else {
    singleton = createInMemoryAgentRepository();
  }

  return singleton;
}

/** Test seam: inject a repository (and reset it afterwards). */
export function setAgentRepositoryForTesting(repository: AgentRepository | null): void {
  singleton = repository;
}
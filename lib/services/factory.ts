import { 
  createInMemoryServiceRequestRepository, 
  createInMemoryServiceResultRepository, 
  type ServiceRequestRepository, 
  type ServiceResultRepository,
  type ServiceRepositoryDescriptor,
} from "./repository";
import { createPostgresServiceResultRepository } from "./postgres";

/**
 * Chooses the service request adapter.
 *
 * - `DATABASE_URL` set  → durable PostgreSQL adapter (production path).
 * - otherwise           → in-memory adapter, explicitly marked non-durable.
 *
 * The in-memory fallback never silently pretends to be durable: its descriptor
 * reports `durable: false`, and the API surfaces that to the client.
 */
let serviceRequestRepo: ServiceRequestRepository | null = null;
let serviceResultRepo: ServiceResultRepository | null = null;

export function hasDurableServiceRequests(): boolean {
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

export async function getServiceRequestRepo(): Promise<ServiceRequestRepository> {
  if (serviceRequestRepo) return serviceRequestRepo;

  const url = getUnpooledDatabaseUrl();
  if (url) {
    const { createPostgresServiceRequestRepository } = await import("./postgres");
    serviceRequestRepo = createPostgresServiceRequestRepository(url);
  } else {
    serviceRequestRepo = createInMemoryServiceRequestRepository();
  }

  return serviceRequestRepo;
}

export async function getServiceResultRepo(): Promise<ServiceResultRepository> {
  if (serviceResultRepo) return serviceResultRepo;

  const url = getUnpooledDatabaseUrl();
  if (url) {
    const { createPostgresServiceResultRepository } = await import("./postgres");
    serviceResultRepo = createPostgresServiceResultRepository(url);
  } else {
    serviceResultRepo = createInMemoryServiceResultRepository();
  }

  return serviceResultRepo;
}

/** Test seam: inject repositories (and reset them afterwards). */
export function setServiceRepositoriesForTesting(
  requestRepo: ServiceRequestRepository | null,
  resultRepo: ServiceResultRepository | null,
): void {
  serviceRequestRepo = requestRepo;
  serviceResultRepo = resultRepo;
}

export function getServiceRepositoryDescriptor(): { request: { kind: "postgres" | "in-memory"; durable: boolean; label: string; note: string }; result: { kind: "postgres" | "in-memory"; durable: boolean; label: string; note: string } } {
  return {
    request: serviceRequestRepo?.descriptor ?? { kind: "in-memory" as const, durable: false, label: "unknown", note: "not initialized" },
    result: serviceResultRepo?.descriptor ?? { kind: "in-memory" as const, durable: false, label: "unknown", note: "not initialized" },
  };
}
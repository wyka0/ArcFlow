import type { ServiceRequest, ServiceResult, ServiceRequestStatus } from "@/types/service-request";

/**
 * Service request repository interface.
 *
 * This is the interface that both in-memory and PostgreSQL implementations must satisfy.
 */
export interface ServiceRequestRepository {
  readonly descriptor: ServiceRepositoryDescriptor;

  create(request: ServiceRequest): Promise<void>;
  getById(id: string): Promise<ServiceRequest | null>;
  getByAgentAndService(agentId: string, serviceId: string): Promise<ServiceRequest[]>;
  getByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<ServiceRequest | null>;
  update(request: ServiceRequest): Promise<void>;
  listAll(): Promise<ServiceRequest[]>;
  clearAll(): Promise<void>;
}

/**
 * Service result repository interface.
 */
export interface ServiceResultRepository {
  readonly descriptor: ServiceRepositoryDescriptor;

  create(result: ServiceResult): Promise<void>;
  getByRequestId(requestId: string): Promise<ServiceResult | null>;
  getByTrustedPaymentId(trustedPaymentId: string): Promise<ServiceResult | null>;
  listAll(): Promise<ServiceResult[]>;
  clearAll(): Promise<void>;
  createResult(result: ServiceResult): Promise<void>;
  getResultByRequestId(requestId: string): Promise<ServiceResult | null>;
  getResultByTrustedPaymentId(trustedPaymentId: string): Promise<ServiceResult | null>;
  listAllResults(): Promise<ServiceResult[]>;
}

export interface ServiceRepositoryDescriptor {
  kind: "postgres" | "in-memory";
  durable: boolean;
  label: string;
  note: string;
}

export type ServiceRequestRepositoryDescriptor = ServiceRepositoryDescriptor;
export type ServiceResultRepositoryDescriptor = ServiceRepositoryDescriptor;

export const IN_MEMORY_SERVICE_REQUEST_DESCRIPTOR: ServiceRepositoryDescriptor = {
  kind: "in-memory",
  durable: false,
  label: "SERVICE REQUEST REPOSITORY (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};

export const POSTGRES_SERVICE_REQUEST_DESCRIPTOR: ServiceRepositoryDescriptor = {
  kind: "postgres",
  durable: true,
  label: "SERVICE REQUEST REPOSITORY (POSTGRES)",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

export const IN_MEMORY_SERVICE_RESULT_DESCRIPTOR: ServiceRepositoryDescriptor = {
  kind: "in-memory",
  durable: false,
  label: "SERVICE RESULT REPOSITORY (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};

export const POSTGRES_SERVICE_RESULT_DESCRIPTOR: ServiceRepositoryDescriptor = {
  kind: "postgres",
  durable: true,
  label: "SERVICE RESULT REPOSITORY (POSTGRES)",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

/**
 * In-memory service request repository.
 *
 * Used for tests and development. A production implementation would use PostgreSQL.
 */
export function createInMemoryServiceRequestRepository(): ServiceRequestRepository {
  const requests = new Map<string, ServiceRequest>();
  const requestsByIdempotency = new Map<string, string>(); // agentId:idempotencyKey -> requestId

  return {
    descriptor: { kind: "in-memory", durable: false, label: "SERVICE REQUEST REPOSITORY (IN-MEMORY)", note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage." },

    async create(request: ServiceRequest): Promise<void> {
      if (requests.has(request.id)) {
        throw new Error("Duplicate service request id.");
      }
      requests.set(request.id, request);
      if (request.idempotencyKey) {
        const key = `${request.agentId}:${request.idempotencyKey}`;
        requestsByIdempotency.set(key, request.id);
      }
    },

    async getById(id: string): Promise<ServiceRequest | null> {
      return requests.get(id) ?? null;
    },

    async getByAgentAndService(agentId: string, serviceId: string): Promise<ServiceRequest[]> {
      return [...requests.values()].filter(
        (r) => r.agentId === agentId && r.serviceId === serviceId,
      );
    },

    async getByIdempotencyKey(agentId: string, idempotencyKey: string): Promise<ServiceRequest | null> {
      const key = `${agentId}:${idempotencyKey}`;
      const requestId = requestsByIdempotency.get(key);
      if (!requestId) return null;
      return requests.get(requestId) ?? null;
    },

    async update(request: ServiceRequest): Promise<void> {
      if (!requests.has(request.id)) {
        throw new Error("Service request not found.");
      }
      requests.set(request.id, request);
      // Idempotency key shouldn't change, but if it does, update the index
      if (request.idempotencyKey) {
        const key = `${request.agentId}:${request.idempotencyKey}`;
        requestsByIdempotency.set(key, request.id);
      }
    },

    async listAll(): Promise<ServiceRequest[]> {
      return [...requests.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async clearAll(): Promise<void> {
      requests.clear();
      requestsByIdempotency.clear();
    },
  };
}

/**
 * In-memory service result repository.
 */
export function createInMemoryServiceResultRepository(): ServiceResultRepository {
  const results = new Map<string, ServiceResult>();

  return {
    descriptor: { kind: "in-memory", durable: false, label: "SERVICE RESULT REPOSITORY (IN-MEMORY)", note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage." },

    async create(result: ServiceResult): Promise<void> {
      if (results.has(result.id)) {
        throw new Error("Duplicate service result id.");
      }
      results.set(result.id, result);
    },

    async getByRequestId(requestId: string): Promise<ServiceResult | null> {
      return [...results.values()].find((r) => r.requestId === requestId) ?? null;
    },

    async getByTrustedPaymentId(trustedPaymentId: string): Promise<ServiceResult | null> {
      return [...results.values()].find((r) => r.trustedPaymentId === trustedPaymentId) ?? null;
    },

    async listAll(): Promise<ServiceResult[]> {
      return [...results.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async clearAll(): Promise<void> {
      results.clear();
    },

    // Service Result methods (new naming convention)
    async createResult(result: ServiceResult): Promise<void> {
      if (results.has(result.id)) {
        throw new Error("Duplicate service result id.");
      }
      results.set(result.id, result);
    },

    async getResultByRequestId(requestId: string): Promise<ServiceResult | null> {
      return [...results.values()].find((r) => r.requestId === requestId) ?? null;
    },

    async getResultByTrustedPaymentId(trustedPaymentId: string): Promise<ServiceResult | null> {
      return [...results.values()].find((r) => r.trustedPaymentId === trustedPaymentId) ?? null;
    },

    async listAllResults(): Promise<ServiceResult[]> {
      return [...results.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  };
}
import type { EvmAddress, TransactionHash } from "./money";

/**
 * A service request initiated by an agent.
 *
 * This represents the full lifecycle from request through fulfillment.
 * Payment and fulfillment are tracked as separate concerns.
 */
export type ServiceRequestStatus =
  | "requested"
  | "payment_required"
  | "payment_pending"
  | "payment_confirmed"
  | "fulfillment_pending"
  | "fulfilled"
  | "failed"
  | "rejected";

export interface ServiceRequest {
  id: string;
  agentId: string;
  serviceId: string;
  serviceName: string;
  /** Input parameters for the service. */
  input: Record<string, unknown>;
  /** Payment intent ID that must be fulfilled before service execution. */
  paymentIntentId: string | null;
  /** Trusted payment ID after verification. */
  trustedPaymentId: string | null;
  /** Transaction hash after wallet submission. */
  txHash: TransactionHash | null;
  status: ServiceRequestStatus;
  /** Error message if status is failed. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** When fulfillment completed (success or failure). */
  fulfilledAt: string | null;
  /**
   * The authenticated wallet that owns this request.
   *
   * `null` for the demo flow (anonymous). When set, the server enforces that
   * only the same authenticated wallet can fetch the request, attempt
   * fulfillment, or read the result.
   */
  ownerWalletAddress: EvmAddress | null;
  /**
   * Optional idempotency key provided by the client.
   *
   * Used to prevent duplicate requests from the same agent.
   * Scoped to agentId + idempotencyKey.
   */
  idempotencyKey: string | null;
}

/**
 * The result of a service fulfillment.
 *
 * This is separate from payment verification — a service can fail
 * even after a successful payment.
 */
export interface ServiceResult {
  id: string;
  requestId: string;
  serviceId: string;
  status: "fulfilled" | "failed";
  /** Structured output from the service. */
  output: Record<string, unknown> | null;
  /** Error message if status is failed. */
  error: string | null;
  /** Reference to the trusted payment that funded this. */
  trustedPaymentId: string;
  fulfilledAt: string;
  createdAt: string;
}

/**
 * Input for creating a service request.
 */
export interface CreateServiceRequestInput {
  agentId: string;
  serviceId: string;
  /** Service-specific input parameters. */
  input: Record<string, unknown>;
  /**
   * The authenticated wallet that owns this request.
   *
   * `null` for the demo flow (anonymous). When set, the server enforces that
   * only the same authenticated wallet can read the request, attempt
   * fulfillment, or retrieve the result.
   */
  ownerWalletAddress: EvmAddress | null;
  /**
   * Optional idempotency key provided by the client.
   *
   * If provided, the server will check for an existing request with the same
   * agentId + idempotencyKey and return that instead of creating a new one.
   */
  idempotencyKey?: string;
}

/**
 * Service adapter interface.
 *
 * Each service implements this to provide fulfillment logic.
 * The adapter does NOT handle payment, policy, or ledger operations.
 */
export interface ServiceAdapter<
  Input extends object = object,
  Output extends object = object
> {
  readonly serviceId: string;
  readonly serviceName: string;

  /**
   * Execute the service with the given input.
   * Returns structured output on success, throws on failure.
   */
  execute(input: Input): Promise<Output>;
}

/**
 * Service request persistence interface.
 *
 * Kept separate from payment persistence to maintain clear boundaries.
 */
export interface ServiceRequestRepository {
  create(request: ServiceRequest): Promise<void>;
  getById(id: string): Promise<ServiceRequest | null>;
  getByAgentAndService(agentId: string, serviceId: string): Promise<ServiceRequest[]>;
  update(request: ServiceRequest): Promise<void>;
  listAll(): Promise<ServiceRequest[]>;
  clearAll(): Promise<void>;
}

export interface ServiceResultRepository {
  create(result: ServiceResult): Promise<void>;
  getByRequestId(requestId: string): Promise<ServiceResult | null>;
  getByTrustedPaymentId(trustedPaymentId: string): Promise<ServiceResult | null>;
  listAll(): Promise<ServiceResult[]>;
  clearAll(): Promise<void>;
}
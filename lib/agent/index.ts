/**
 * Server-side agent integration for AgentPay.
 *
 * Public entry point for route handlers. Browser code MUST NOT import from
 * this module; the architecture test enforces that contract.
 */
export {
  authenticateAgent,
  generateApiKey,
  isValidApiKeyFormat,
  registerAgent,
  getAgentById,
  getAgentsByOwner,
  updateAgentStatus,
  type AgentAuthOutcome,
  type AgentAuthErrorCode,
} from "./auth";

export {
  guardAgentRequest,
  guardAgentReadRequest,
  type AgentAuthGuardOptions,
  type AgentAuthGuardOutcome,
} from "./guard";

export {
  getAgentRepository,
  hasDurableAgentRegistry,
  setAgentRepositoryForTesting,
  type AgentRepository,
  type AgentRepositoryDescriptor,
} from "./factory";

export {
  createInMemoryAgentRepository,
  type AgentRepositoryType,
} from "./repository";

export type {
  AgentIdentity,
  AgentStatus,
  CreateAgentInput,
  AgentRegistrationResult,
  AuthenticatedAgent,
  PublicAgentView,
} from "@/types/agent";

export { getOptionalWallet } from "@/lib/auth";
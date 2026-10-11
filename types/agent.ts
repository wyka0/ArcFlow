import type { EvmAddress, TokenAmount } from "./money";

/**
 * Agent identity for programmatic external agent integration.
 *
 * This represents a registered external AI agent that can interact with
 * AgentPay via API credentials. The agent is owned by a human wallet
 * and all payments require explicit human wallet approval.
 */
export type AgentStatus = "active" | "disabled";

export interface AgentIdentity {
  id: string;
  name: string;
  description: string;
  ownerWalletAddress: EvmAddress;
  apiKeyHash: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Legacy demo agent type — used by the UI demo only.
 * Includes nullable wallet/balance fields for display purposes.
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  walletAddress: EvmAddress | null;
  balance: TokenAmount | null;
  status: AgentStatus;
}

/**
 * Input for creating a new agent registration.
 */
export interface CreateAgentInput {
  name: string;
  description: string;
}

/**
 * Result of agent registration (includes raw API key shown once).
 */
export interface AgentRegistrationResult {
  agent: Omit<AgentIdentity, "apiKeyHash">;
  apiKey: string;
}

/**
 * Agent authentication result from API key validation.
 */
export interface AuthenticatedAgent {
  agentId: string;
  name: string;
  ownerWalletAddress: EvmAddress;
  status: AgentStatus;
}

/**
 * Public agent view (excludes sensitive fields).
 */
export interface PublicAgentView {
  id: string;
  name: string;
  description: string;
  ownerWalletAddress: EvmAddress;
  status: AgentStatus;
  createdAt: string;
}
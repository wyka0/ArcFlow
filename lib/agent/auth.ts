import { getAgentRepository, setAgentRepositoryForTesting } from "./factory";
import type { AgentIdentity, AuthenticatedAgent } from "@/types/agent";
import type { AgentRepository } from "./repository";

/**
 * Agent authentication error codes.
 */
export type AgentAuthErrorCode =
  | "MISSING_AUTHORIZATION"
  | "MALFORMED_AUTHORIZATION"
  | "INVALID_API_KEY"
  | "AGENT_DISABLED"
  | "AGENT_NOT_FOUND";

export interface AgentAuthResult {
  ok: true;
  agent: AuthenticatedAgent;
}

export interface AgentAuthError {
  ok: false;
  code: AgentAuthErrorCode;
  message: string;
}

export type AgentAuthOutcome = AgentAuthResult | AgentAuthError;

/**
 * Hash an API key using SHA-256.
 *
 * We use a simple but secure approach: SHA-256 with a fixed prefix to
 * domain-separate from other uses. The raw key is never stored.
 */
async function hashApiKey(rawKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`agentpay-api-key:${rawKey}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a cryptographically secure API key.
 *
 * Format: `ap_<24 random bytes as hex>` = 4 + 48 = 52 chars
 * The prefix "ap_" identifies it as an AgentPay agent API key.
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ap_${hex}`;
}

/**
 * Validate API key format.
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^ap_[0-9a-f]{48}$/.test(key);
}

/**
 * Authenticate an agent by API key from Authorization header.
 *
 * The Authorization header must be: `Bearer <api-key>`
 *
 * The raw API key is hashed and compared against the stored hash.
 * The agent ID returned comes from the stored record, NOT from the request body.
 */
export async function authenticateAgent(
  request: Request,
): Promise<AgentAuthOutcome> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, code: "MISSING_AUTHORIZATION", message: "Authorization header required." };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { ok: false, code: "MALFORMED_AUTHORIZATION", message: "Authorization header must be 'Bearer <api-key>'." };
  }

  const rawKey = parts[1].trim();
  if (!isValidApiKeyFormat(rawKey)) {
    return { ok: false, code: "INVALID_API_KEY", message: "Invalid API key format." };
  }

  const apiKeyHash = await hashApiKey(rawKey);

  const repo = await getAgentRepository();
  const agent = await repo.getByApiKeyHash(apiKeyHash);

  if (!agent) {
    return { ok: false, code: "INVALID_API_KEY", message: "Invalid API key." };
  }

  if (agent.status !== "active") {
    return { ok: false, code: "AGENT_DISABLED", message: "Agent is disabled." };
  }

  return {
    ok: true,
    agent: {
      agentId: agent.id,
      name: agent.name,
      ownerWalletAddress: agent.ownerWalletAddress,
      status: agent.status,
    },
  };
}

/**
 * Get an agent by ID (for ownership checks).
 */
export async function getAgentById(agentId: string): Promise<AgentIdentity | null> {
  const repo = await getAgentRepository();
  return repo.getById(agentId);
}

/**
 * Get all agents owned by a wallet.
 */
export async function getAgentsByOwner(ownerWalletAddress: string): Promise<AgentIdentity[]> {
  const repo = await getAgentRepository();
  return repo.getByOwnerWallet(ownerWalletAddress);
}

/**
 * Create a new agent registration.
 *
 * The owner wallet is derived from the authenticated human session.
 * Returns the agent record and the raw API key (shown ONCE).
 */
export async function registerAgent(input: {
  name: string;
  description: string;
  ownerWalletAddress: string;
}): Promise<{ agent: AgentIdentity; apiKey: string }> {
  const repo = await getAgentRepository();

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  const now = new Date().toISOString();
  const agent: AgentIdentity = {
    id: `agent_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    name: input.name,
    description: input.description,
    ownerWalletAddress: input.ownerWalletAddress.toLowerCase() as `0x${string}`,
    apiKeyHash,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await repo.create(agent);

  return { agent, apiKey };
}

/**
 * Update agent status (activate/disable).
 */
export async function updateAgentStatus(
  agentId: string,
  ownerWalletAddress: string,
  status: "active" | "disabled",
): Promise<AgentIdentity | null> {
  const repo = await getAgentRepository();
  const agent = await repo.getById(agentId);

  if (!agent) return null;
  if (agent.ownerWalletAddress.toLowerCase() !== ownerWalletAddress.toLowerCase()) {
    return null;
  }

  const updated: AgentIdentity = {
    ...agent,
    status,
    updatedAt: new Date().toISOString(),
  };

  await repo.update(updated);
  return updated;
}

/** Test seam. */
export function setAgentAuthRepositoryForTesting(repository: AgentRepository | null): void {
  setAgentRepositoryForTesting(repository);
}
import type { AgentIdentity } from "@/types/agent";

/**
 * Agent repository interface.
 *
 * This is the ONLY abstraction the server uses to read/write agent data.
 * Browser code MUST NOT import from this module.
 */
export interface AgentRepositoryDescriptor {
  kind: "postgres" | "in-memory";
  durable: boolean;
  label: string;
  note: string;
}

export interface AgentRepository {
  readonly descriptor: AgentRepositoryDescriptor;

  create(agent: AgentIdentity): Promise<void>;
  getById(id: string): Promise<AgentIdentity | null>;
  getByApiKeyHash(apiKeyHash: string): Promise<AgentIdentity | null>;
  getByOwnerWallet(ownerWalletAddress: string): Promise<AgentIdentity[]>;
  update(agent: AgentIdentity): Promise<void>;
  listAll(): Promise<AgentIdentity[]>;
  clearAll(): Promise<void>;
}

export const IN_MEMORY_AGENT_DESCRIPTOR: AgentRepositoryDescriptor = {
  kind: "in-memory",
  durable: false,
  label: "AGENT REGISTRY (IN-MEMORY)",
  note: "Development fallback. Records are lost on restart; set DATABASE_URL for durable storage.",
};

export const POSTGRES_AGENT_DESCRIPTOR: AgentRepositoryDescriptor = {
  kind: "postgres",
  durable: true,
  label: "AGENT REGISTRY (POSTGRES)",
  note: "Server-side PostgreSQL. Outside browser control; suitable for deployment.",
};

export function createInMemoryAgentRepository(): AgentRepository {
  const agents = new Map<string, AgentIdentity>();
  const agentsByApiKeyHash = new Map<string, AgentIdentity>();
  const agentsByOwner = new Map<string, Set<string>>();

  return {
    descriptor: IN_MEMORY_AGENT_DESCRIPTOR,

    async create(agent) {
      if (agents.has(agent.id)) {
        throw new Error("Duplicate agent id.");
      }
      if (agentsByApiKeyHash.has(agent.apiKeyHash)) {
        throw new Error("Duplicate API key hash.");
      }
      agents.set(agent.id, agent);
      agentsByApiKeyHash.set(agent.apiKeyHash, agent);
      const ownerSet = agentsByOwner.get(agent.ownerWalletAddress.toLowerCase()) ?? new Set();
      ownerSet.add(agent.id);
      agentsByOwner.set(agent.ownerWalletAddress.toLowerCase(), ownerSet);
    },

    async getById(id) {
      return agents.get(id) ?? null;
    },

    async getByApiKeyHash(apiKeyHash) {
      return agentsByApiKeyHash.get(apiKeyHash) ?? null;
    },

    async getByOwnerWallet(ownerWalletAddress) {
      const ids = agentsByOwner.get(ownerWalletAddress.toLowerCase()) ?? new Set();
      return [...ids].map((id) => agents.get(id)!).filter(Boolean);
    },

    async update(agent) {
      if (!agents.has(agent.id)) {
        throw new Error("Agent not found.");
      }
      const existing = agents.get(agent.id)!;
      if (existing.apiKeyHash !== agent.apiKeyHash) {
        agentsByApiKeyHash.delete(existing.apiKeyHash);
        agentsByApiKeyHash.set(agent.apiKeyHash, agent);
      }
      agents.set(agent.id, agent);
    },

    async listAll() {
      return [...agents.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async clearAll() {
      agents.clear();
      agentsByApiKeyHash.clear();
      agentsByOwner.clear();
    },
  };
}

export type AgentRepositoryType = ReturnType<typeof createInMemoryAgentRepository>;
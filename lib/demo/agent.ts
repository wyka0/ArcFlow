import type { Agent, SpendingPolicy } from "@/types";

/**
 * Local demo configuration.
 *
 * `walletAddress` and `balance` are intentionally null. No on-chain data has been
 * loaded, so the UI renders "Not connected" instead of a fabricated value.
 */
export const DEMO_AGENT: Agent = {
  id: "agent_research_01",
  name: "Research Agent",
  description: "Purchases market data, research reports, and AI summaries to complete user tasks.",
  walletAddress: null,
  balance: null,
  status: "active",
};

export const DEMO_SPENDING_POLICY: SpendingPolicy = {
  id: "policy_research_01",
  agentId: DEMO_AGENT.id,
  maxPerTransaction: 1.0,
  dailyLimit: 5.0,
  currency: "USDC",
  allowedCategories: ["research", "data", "ai"],
};

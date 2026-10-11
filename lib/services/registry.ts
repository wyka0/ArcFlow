import type { Service } from "@/types";

/**
 * Local demo service definitions.
 *
 * These are NOT connected to any external provider or marketplace. They exist so
 * the decision and policy layers can be exercised end to end without a network.
 */
export const DEMO_SERVICES: readonly Service[] = [
  {
    id: "market-data",
    name: "Market Data",
    category: "data",
    price: 0.1,
    currency: "USDC",
    active: true,
    description: "Real-time market intelligence via CoinGecko (when enabled) or fixture data.",
  },
  {
    id: "research-report",
    name: "Research Report",
    category: "research",
    price: 0.25,
    currency: "USDC",
    active: true,
    description: "Structured research output on requested topics.",
  },
  {
    id: "ai-summary",
    name: "AI Summary",
    category: "ai",
    price: 0.05,
    currency: "USDC",
    active: true,
    description: "AI-powered text summarization with configurable length.",
  },
];

export function listServices(): readonly Service[] {
  return DEMO_SERVICES;
}

export function listActiveServices(): readonly Service[] {
  return DEMO_SERVICES.filter((service) => service.active);
}

export function getService(id: string): Service | undefined {
  return DEMO_SERVICES.find((service) => service.id === id);
}

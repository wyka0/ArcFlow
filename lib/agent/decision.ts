import { getService } from "@/lib/services/registry";
import type { ConfirmedPayment, Service, ServiceCategory, SpendingPolicy } from "@/types";

import { buildSpendingSummary, evaluatePolicy, type PolicyViolation } from "./policy";

export interface DecisionSelection {
  service: Service;
  cost: number;
  reason: string;
}

export type AgentDecision =
  | { status: "no-match"; task: string; reason: string }
  | { status: "blocked"; task: string; selection: DecisionSelection; violations: readonly PolicyViolation[] }
  | { status: "approved"; task: string; selection: DecisionSelection };

export interface DecisionRequest {
  task: string;
  policy: SpendingPolicy;
  services: readonly Service[];
  /** Canonical confirmed on-chain history used for the daily-limit check. */
  confirmedHistory?: readonly ConfirmedPayment[];
  now?: Date;
}

interface ServiceIntent {
  category: ServiceCategory;
  keywords: readonly string[];
  limit?: number;
}

const INTENTS: readonly ServiceIntent[] = [
  {
    category: "data",
    keywords: ["price", "market", "token", "ohlc", "kline", "k-line", "volume", "liquidity", "quote"],
  },
  {
    category: "research",
    keywords: ["research", "report", "deep-dive", "deep dive", "analysis", "diligence", "compare", "fundamentals", "outlook"],
  },
  {
    category: "ai",
    keywords: ["summary", "summarise", "summarize", "condense", "abstract", "tldr", "explain", "brief"],
  },
  {
    category: "data",
    keywords: ["token", "screener"],
    limit: 1,
  },
];

function tokenize(task: string): string[] {
  return task
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 0);
}

function scoreService(service: Service, tokens: readonly string[]): number {
  const intents = INTENTS.filter((intent) => intent.category === service.category);
  const keywords = intents.flatMap((intent) => intent.keywords);
  return tokens.reduce((score, token) => (keywords.includes(token) ? score + 1 : score), 0);
}

export function selectService(
  task: string,
  services: readonly Service[],
): DecisionSelection | null {
  const tokens = tokenize(task);
  const candidates = services.filter((service) => service.active);

  const ranked = candidates
    .map((service) => ({ service, score: scoreService(service, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.service.price !== b.service.price) return a.service.price - b.service.price;
      return a.service.id.localeCompare(b.service.id);
    });

  const best = ranked[0];
  if (!best) {
    return null;
  }

  return {
    service: best.service,
    cost: best.service.price,
    reason: `Matched category "${best.service.category}" from the task keywords.`,
  };
}

export function decide(request: DecisionRequest): AgentDecision {
  const { task, policy, services, confirmedHistory = [], now = new Date() } = request;

  const selection = selectService(task, services);
  if (!selection) {
    return {
      status: "no-match",
      task,
      reason: "No active service matched the task keywords.",
    };
  }

  const persisted = getService(selection.service.id);
  const service = persisted ?? selection.service;

  const spending = buildSpendingSummary(policy, confirmedHistory, now);

  const decision = evaluatePolicy({
    policy,
    service,
    amount: selection.cost,
    spentToday: spending.spentToday,
  });

  if (!decision.allowed) {
    return { status: "blocked", task, selection, violations: decision.violations };
  }

  return { status: "approved", task, selection };
}

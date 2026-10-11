import { isAddress } from "viem";

import type { EvmAddress } from "@/types";

/**
 * Demo payment recipient configuration.
 *
 * AgentPay never invents a recipient. Each service has an explicitly configured
 * address that must be set through the environment; until then the payment flow
 * is blocked with "Payment recipient not configured".
 *
 * These are DEMO/TEST recipients. None of the configured addresses is presented
 * as a production service provider, and the connected user's own address is
 * never silently used as the recipient.
 *
 * The values are public (they appear in a client-side transaction), so they use
 * the NEXT_PUBLIC_ prefix and hold no secret. The `process.env.X` reads below
 * are static so Next.js can inline them into the browser bundle.
 */
export interface RecipientResolution {
  serviceId: string;
  address: EvmAddress | null;
  /** True for every Sprint 2A recipient — there is no production provider yet. */
  isDemo: boolean;
}

type RecipientEnv = Record<string, string | undefined>;

const RECIPIENT_ENV: RecipientEnv = {
  "market-data": process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT,
  "research-report": process.env.NEXT_PUBLIC_AGENTPAY_RESEARCH_REPORT_RECIPIENT,
  "ai-summary": process.env.NEXT_PUBLIC_AGENTPAY_AI_SUMMARY_RECIPIENT,
};

export function resolveServiceRecipient(
  serviceId: string,
  env: RecipientEnv = RECIPIENT_ENV,
): RecipientResolution {
  const raw = env[serviceId]?.trim();
  if (!raw || !isAddress(raw, { strict: false })) {
    return { serviceId, address: null, isDemo: true };
  }
  return { serviceId, address: raw as EvmAddress, isDemo: true };
}

export function getRecipientEnvVarName(serviceId: string): string {
  switch (serviceId) {
    case "market-data":
      return "NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT";
    case "research-report":
      return "NEXT_PUBLIC_AGENTPAY_RESEARCH_REPORT_RECIPIENT";
    case "ai-summary":
      return "NEXT_PUBLIC_AGENTPAY_AI_SUMMARY_RECIPIENT";
    default:
      return `NEXT_PUBLIC_AGENTPAY_${serviceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_RECIPIENT`;
  }
}

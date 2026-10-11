import { isAddress } from "viem";

import { resolveServiceRecipient } from "../recipients";
import type { EvmAddress } from "@/types";

/**
 * Server-side configuration.
 *
 * Recipients are resolved from server runtime environment variables first
 * (`AGENTPAY_<SERVICE>_RECIPIENT`, not inlined into any client bundle), falling
 * back to the shared public configuration. The server never invents a recipient.
 *
 * This module is server-only. It must never be imported by client components.
 */
const SERVER_RECIPIENT_ENV: Record<string, string | undefined> = {
  "market-data": process.env.AGENTPAY_MARKET_DATA_RECIPIENT,
  "research-report": process.env.AGENTPAY_RESEARCH_REPORT_RECIPIENT,
  "ai-summary": process.env.AGENTPAY_AI_SUMMARY_RECIPIENT,
};

export function resolveServerRecipient(serviceId: string): EvmAddress | null {
  const override = SERVER_RECIPIENT_ENV[serviceId]?.trim();
  if (override && isAddress(override, { strict: false })) {
    return override as EvmAddress;
  }
  return resolveServiceRecipient(serviceId).address;
}

/** How long an approved payment intent stays valid. */
export const INTENT_TTL_MS = 30 * 60 * 1000;

/**
 * Production recipient validation.
 *
 * AgentPay must never silently substitute a fake or personal wallet
 * address as a service recipient. This module:
 *  - Exposes a single resolution function the service runtime calls.
 *  - Refuses to return a fallback for production services whose
 *    recipient is not explicitly configured. The route handler is
 *    expected to return a `RECIPIENT_NOT_CONFIGURED` 503 to the client.
 *  - Allows demo/local configuration only outside production.
 *
 * This is additive to the existing `lib/payments/recipients.ts` helper
 * (which is still used for the client-visible recipient lookup). The
 * new layer enforces that we never ship a transaction to a fake
 * address.
 */

import { isAddress } from "viem";

import { getServerRuntime } from "./env";
import { resolveServiceRecipient, type RecipientResolution } from "@/lib/payments/recipients";
import { logSecurityEvent } from "./logger";
import { hashKey } from "./rate-limit";

export interface ProductionRecipientResolution {
  serviceId: string;
  address: string | null;
  status: "configured" | "unconfigured";
  /** True when the configured value is a demo/placeholder. */
  isDemo: boolean;
  /** True when the runtime is non-production. */
  isDevelopment: boolean;
}

const DEMO_ADDRESS_PATTERNS: RegExp[] = [
  /^0x0{40}$/i, // all zeros
  /^0xdead/i,
  /^0xcafe/i,
];

/**
 * Resolve the recipient for a service, with strict production semantics.
 *
 *  - In production, a missing or placeholder address is reported as
 *    `unconfigured`. The route handler MUST refuse the request.
 *  - In development, the helper returns whatever the underlying
 *    resolver returns; routes may still operate against demo recipients.
 */
export function resolveProductionRecipient(
  serviceId: string,
  options: { identityKey?: string } = {},
): ProductionRecipientResolution {
  // Build a fresh env snapshot so test overrides take effect.
  const freshEnv = {
    "market-data": process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT,
    "research-report": process.env.NEXT_PUBLIC_AGENTPAY_RESEARCH_REPORT_RECIPIENT,
    "ai-summary": process.env.NEXT_PUBLIC_AGENTPAY_AI_SUMMARY_RECIPIENT,
  };
  const raw = resolveServiceRecipient(serviceId, freshEnv);
  const runtime = getServerRuntime();
  const isDev = runtime !== "production";
  const looksLikeDemo =
    raw.address === null ||
    DEMO_ADDRESS_PATTERNS.some((re) => raw.address !== null && re.test(raw.address));

  // In production, an unconfigured / demo address is unusable.
  if (runtime === "production" && (raw.address === null || looksLikeDemo)) {
    logSecurityEvent({
      kind: "RECIPIENT_REJECTED",
      keyHash: options.identityKey ? hashKey(options.identityKey) : undefined,
      detail: `service=${serviceId}`,
    });
    return {
      serviceId,
      address: null,
      status: "unconfigured",
      isDemo: true,
      isDevelopment: false,
    };
  }

  return {
    serviceId,
    address: raw.address,
    status: raw.address && isAddress(raw.address, { strict: false }) ? "configured" : "unconfigured",
    isDemo: raw.isDemo || looksLikeDemo,
    isDevelopment: isDev,
  };
}

/**
 * Quick re-export so route code can do a single import.
 */
export type { RecipientResolution };

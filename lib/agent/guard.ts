import { NextResponse } from "next/server";

import { authenticateAgent, type AgentAuthOutcome, type AgentAuthErrorCode } from "./auth";
import { applySecurityHeaders } from "@/lib/security/headers";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { getPolicy, consumeRateLimit } from "@/lib/security/rate-limit";

export interface AgentAuthGuardOptions {
  policy: "AGENT_REGISTER" | "AGENT_REQUEST" | "AGENT_STATUS" | "AGENT_RESULT";
}

import type { EvmAddress } from "@/types/money";

export interface AgentAuthGuardResult {
  ok: true;
  agent: { agentId: string; name: string; ownerWalletAddress: EvmAddress; status: string };
  identityKey: string;
}

export interface AgentAuthGuardError {
  ok: false;
  response: NextResponse;
}

export type AgentAuthGuardOutcome = AgentAuthGuardResult | AgentAuthGuardError;

function errorResponse(status: number, code: string, message: string): NextResponse {
  const response = NextResponse.json(
    { ok: false, error: { code, message } },
    { status },
  );
  applySecurityHeaders(response);
  return response;
}

export async function guardAgentRequest(
  request: Request,
  options: AgentAuthGuardOptions,
): Promise<AgentAuthGuardOutcome> {
  // 1. Authenticate agent via API key
  const authResult = await authenticateAgent(request);
  if (!authResult.ok) {
    const status = authResult.code === "MISSING_AUTHORIZATION" || authResult.code === "MALFORMED_AUTHORIZATION"
      ? 401
      : authResult.code === "AGENT_DISABLED"
      ? 403
      : 401;
    const response = errorResponse(status, `AGENT_${authResult.code}`, authResult.message);
    return { ok: false, response };
  }

  const identityKey = `agent:${authResult.agent.agentId}`;

  // 2. Rate limit by agent identity
  const decision = consumeRateLimit({
    key: identityKey,
    policy: getPolicy(options.policy),
    requestId: request.headers.get("x-request-id") ?? undefined,
  });
  if (!decision.ok) {
    logSecurityEvent({
      kind: "RATE_LIMITED",
      keyHash: hashKey(identityKey),
      policy: decision.policy.name,
    });
    const response = errorResponse(429, "RATE_LIMITED", "Too many requests. Slow down and try again shortly.");
    response.headers.set("Retry-After", Math.ceil(decision.retryAfterMs / 1000).toString());
    return { ok: false, response };
  }

  return {
    ok: true,
    agent: authResult.agent,
    identityKey,
  };
}

/**
 * Guard for read-only agent endpoints (GET).
 */
export async function guardAgentReadRequest(
  request: Request,
  options: { policy: "AGENT_STATUS" | "AGENT_RESULT" },
): Promise<AgentAuthGuardOutcome> {
  return guardAgentRequest(request, options);
}
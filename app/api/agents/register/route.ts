import { NextResponse } from "next/server";

import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { readStringField } from "@/lib/security/request-body";
import { registerAgent, getAgentsByOwner, getOptionalWallet } from "@/lib/agent";

/**
 * POST /api/agents/register
 *
 * Registers a new external agent identity.
 *
 * Authentication: requires an authenticated human wallet session.
 * The owner wallet is derived from the session, NOT from the request body.
 *
 * Request:
 * {
 *   "name": "My Research Agent",
 *   "description": "Autonomous market research agent"
 * }
 *
 * Response (201):
 * {
 *   "ok": true,
 *   "agent": { "id": "...", "name": "...", "description": "...", "status": "active", "ownerWalletAddress": "...", "createdAt": "..." },
 *   "apiKey": "ap_<raw-key>"
 * }
 *
 * IMPORTANT: The raw apiKey is returned ONLY during registration.
 * It cannot be recovered later. Save it immediately.
 *
 * Security:
 *  - Body size cap: 4 KB
 *  - Rate limited under AGENT_REGISTER (5 / minute / identity)
 *  - Same-origin enforced
 *  - Requires human wallet authentication
 */
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "AGENT_REGISTER",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  // Require human wallet authentication
  const ownerWalletAddress = await getOptionalWallet(request);
  if (!ownerWalletAddress) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Human wallet authentication required to register an agent." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const nameField = readStringField(guard.body, "name", 128);
  if (!nameField.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: nameField.code, message: nameField.message } },
      { status: nameField.status },
    );
    applySecurityHeaders(response);
    return response;
  }

  const descriptionField = readStringField(guard.body, "description", 1024);
  if (!descriptionField.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: descriptionField.code, message: descriptionField.message } },
      { status: descriptionField.status },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    const { agent, apiKey } = await registerAgent({
      name: nameField.value,
      description: descriptionField.value,
      ownerWalletAddress,
    });

    logSecurityEvent({
      kind: "AGENT_REGISTERED",
      keyHash: hashKey(guard.identityKey),
      detail: `agentId=${agent.id}`,
    });

    const response = NextResponse.json(
      {
        ok: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          status: agent.status,
          ownerWalletAddress: agent.ownerWalletAddress,
          createdAt: agent.createdAt,
        },
        apiKey,
      },
      { status: 201 },
    );
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent registration failed.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}

/**
 * GET /api/agents/register
 *
 * Lists all agents owned by the authenticated human wallet.
 *
 * Authentication: requires an authenticated human wallet session.
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "agents": [
 *     { "id": "...", "name": "...", "description": "...", "status": "active", "ownerWalletAddress": "...", "createdAt": "..." }
 *   ]
 * }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<undefined>(request, {
    policy: "AGENT_REGISTER",
    maxBytes: MAX_BODY_BYTES,
    method: "GET",
  });
  if (!guard.ok) return guard.response;

  const ownerWalletAddress = await getOptionalWallet(request);
  if (!ownerWalletAddress) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Human wallet authentication required." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const agents = await getAgentsByOwner(ownerWalletAddress);

  const response = NextResponse.json({
    ok: true,
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      ownerWalletAddress: agent.ownerWalletAddress,
      createdAt: agent.createdAt,
    })),
  });
  applySecurityHeaders(response);
  return response;
}
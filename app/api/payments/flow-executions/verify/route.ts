import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import { parseFlowExecutionVerifyRequest } from "@/lib/payments/server/validation";
import {
  TrustedLedgerUnavailableError,
  verifyFlowExecution,
} from "@/lib/payments/server/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/flow-executions/verify
 *
 * Accepts only `{ txHash }`. The server verifies the transaction against Arc
 * before recording it: the flow id is derived from the receipt's FlowExecuted
 * event, the expected configuration is read from the contract, and the
 * amounts, recipients, and ownership are verified server-side. Client-supplied
 * amounts or recipients are ignored because they are never read.
 *
 * Authentication: mandatory — flow executions are wallet-owned, and the
 * authenticated session wallet must be the flow owner.
 *
 * Security:
 *  - Body size cap: 2 KB (txHash only).
 *  - Rate limited under FLOW_EXECUTION_VERIFY (30 / minute / identity).
 *  - Same-origin enforced.
 */
const MAX_BODY_BYTES = 2 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<unknown>(request, {
    policy: "FLOW_EXECUTION_VERIFY",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const parsed = parseFlowExecutionVerifyRequest(guard.body);
  if (!parsed.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: parsed.code, message: parsed.message } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const authenticatedWallet = await getOptionalWallet(request);

  try {
    const outcome = await verifyFlowExecution({
      txHash: parsed.body.txHash,
      authenticatedWallet,
    });

    if (outcome.status === "rejected") {
      logSecurityEvent({
        kind: "FLOW_EXECUTION_VERIFY_REJECTED",
        keyHash: hashKey(guard.identityKey),
        detail: `reason=${outcome.reason}`,
      });
      const status =
        outcome.reason === "FORBIDDEN" ? 403 : outcome.reason === "UNAUTHENTICATED" ? 401 : 422;
      const response = NextResponse.json(
        { ok: false, error: { code: outcome.reason, message: outcome.message } },
        { status },
      );
      applySecurityHeaders(response);
      return response;
    }

    logSecurityEvent({
      kind: "FLOW_EXECUTION_VERIFIED",
      keyHash: hashKey(guard.identityKey),
      detail: `flowId=${outcome.record.flowId} alreadyRecorded=${outcome.alreadyRecorded}`,
    });

    const response = NextResponse.json({
      ok: true,
      alreadyRecorded: outcome.alreadyRecorded,
      record: outcome.record,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) {
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "The trusted payment ledger is unavailable.",
          },
        },
        { status: 503 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "The flow execution could not be verified." },
      },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}

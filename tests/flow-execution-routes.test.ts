/**
 * Flow-execution route tests — authentication, request validation, ownership,
 * idempotency, and wallet-scoped history.
 *
 * No network and no database: the chain reader is injected and the ledger is
 * the in-memory adapter. `NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS` is set before
 * the modules are imported (and modules are re-imported per test), matching the
 * established ArcFlow test pattern.
 */
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEST_CONTRACT,
  TX_HASH_A,
  TX_HASH_B,
  defaultOnChainFlow,
  defaultSplit,
  makeFlowChainReader,
  makeReceipt,
  splitLogs,
} from "./flow-execution-fixtures";

const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

const userA = privateKeyToAccount(`0x${"1".repeat(64)}` as `0x${string}`);
const userB = privateKeyToAccount(`0x${"2".repeat(64)}` as `0x${string}`);

type VerifyRouteModule = typeof import("@/app/api/payments/flow-executions/verify/route");
type HistoryRouteModule = typeof import("@/app/api/payments/history/route");
type AuthModule = typeof import("@/lib/auth");
type ChainModule = typeof import("@/lib/payments/server/chain");
type FactoryModule = typeof import("@/lib/payments/server/factory");
type SecurityModule = typeof import("@/lib/security");
type ChallengeRouteModule = typeof import("@/app/api/auth/challenge/route");
type AuthVerifyRouteModule = typeof import("@/app/api/auth/verify/route");

let verifyRoute: VerifyRouteModule;
let historyRoute: HistoryRouteModule;
let auth: AuthModule;
let chain: ChainModule;
let factory: FactoryModule;
let security: SecurityModule;
let challengeRoute: ChallengeRouteModule;
let authVerifyRoute: AuthVerifyRouteModule;

const splitA = defaultSplit({ owner: userA.address });
const flowA = defaultOnChainFlow({ owner: userA.address });
const receiptA = makeReceipt({ from: userA.address, logs: splitLogs(splitA) });

beforeEach(async () => {
  process.env[ENV_KEY] = TEST_CONTRACT;
  vi.resetModules();

  verifyRoute = await import("@/app/api/payments/flow-executions/verify/route");
  historyRoute = await import("@/app/api/payments/history/route");
  auth = await import("@/lib/auth");
  chain = await import("@/lib/payments/server/chain");
  factory = await import("@/lib/payments/server/factory");
  security = await import("@/lib/security");
  challengeRoute = await import("@/app/api/auth/challenge/route");
  authVerifyRoute = await import("@/app/api/auth/verify/route");

  auth.setChallengeStoreForTesting(auth.createInMemoryChallengeStore());
  auth.setAuthSessionRepositoryForTesting(auth.createInMemoryAuthSessionRepository());
  factory.setTrustedRepositoryForTesting(factory.createInMemoryTrustedRepository());
  security.setRateLimitStoreForTesting(new security.InMemoryRateLimitStore());
  security.setSecurityLoggerSinkForTesting(() => {});
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

function jsonPost(url: string, body: unknown, cookieValue?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://app.agentpay.example",
  };
  if (cookieValue) headers["cookie"] = `${auth.SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function jsonGet(url: string, cookieValue?: string): Request {
  const headers: Record<string, string> = { origin: "https://app.agentpay.example" };
  if (cookieValue) headers["cookie"] = `${auth.SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request(url, { method: "GET", headers });
}

async function signIn(account: ReturnType<typeof privateKeyToAccount>): Promise<string> {
  const challengeResp = await challengeRoute.POST(
    jsonPost("https://app.agentpay.example/api/auth/challenge", {
      walletAddress: account.address,
    }),
  );
  const challengeBody = await challengeResp.json();
  const challenge = challengeBody.challenge;
  const signature = await account.signMessage({ message: challenge.message });
  const verifyResp = await authVerifyRoute.POST(
    jsonPost("https://app.agentpay.example/api/auth/verify", {
      walletAddress: account.address,
      challengeId: challenge.id,
      signature,
    }),
  );
  return (verifyResp.headers.get("set-cookie") ?? "").split(";")[0]?.split("=")[1] ?? "";
}

async function verifyExecution(txHash: string, cookieValue?: string): Promise<Response> {
  return verifyRoute.POST(
    jsonPost(
      "https://app.agentpay.example/api/payments/flow-executions/verify",
      { txHash },
      cookieValue,
    ),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(response: Response): Promise<{ status: number; body: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json()) as any };
}

describe("POST /api/payments/flow-executions/verify", () => {
  it("requires authentication (401)", async () => {
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: receiptA, flowResult: { status: "ok", flow: flowA } }),
    );

    const { status, body } = await readJson(await verifyExecution(TX_HASH_A));
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a malformed body with 400", async () => {
    const cookie = await signIn(userA);

    const { status, body } = await readJson(await verifyExecution("0x1234", cookie));
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_TX_HASH");
  });

  it("verifies, records, and is idempotent (200)", async () => {
    const cookie = await signIn(userA);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: receiptA, flowResult: { status: "ok", flow: flowA } }),
    );

    const first = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.alreadyRecorded).toBe(false);
    expect(first.body.record.kind).toBe("flow_execution");
    expect(first.body.record.txHash).toBe(TX_HASH_A);
    expect(first.body.record.flowId).toBe("1");
    expect(first.body.record.ownerWalletAddress.toLowerCase()).toBe(userA.address.toLowerCase());
    expect(first.body.record.totalAmountBaseUnits).toBe("10000");

    const second = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(second.status).toBe(200);
    expect(second.body.alreadyRecorded).toBe(true);
    expect(second.body.record.id).toBe(first.body.record.id);
  });

  it("ignores client-supplied flow ids, amounts, and owners", async () => {
    const cookie = await signIn(userA);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: receiptA, flowResult: { status: "ok", flow: flowA } }),
    );

    const { status, body } = await readJson(
      await verifyRoute.POST(
        jsonPost(
          "https://app.agentpay.example/api/payments/flow-executions/verify",
          {
            txHash: TX_HASH_A,
            flowId: "999",
            totalAmountBaseUnits: "999999999",
            ownerWalletAddress: userB.address,
            treasury: userB.address,
          },
          cookie,
        ),
      ),
    );

    expect(status).toBe(200);
    expect(body.record.flowId).toBe("1");
    expect(body.record.totalAmountBaseUnits).toBe("10000");
    expect(body.record.ownerWalletAddress.toLowerCase()).toBe(userA.address.toLowerCase());
    expect(body.record.treasury.toLowerCase()).not.toBe(userB.address.toLowerCase());
  });

  it("returns 403 for a flow the session wallet does not own", async () => {
    const cookie = await signIn(userB);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: receiptA, flowResult: { status: "ok", flow: flowA } }),
    );

    const { status, body } = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 422 for a rejected verification (reverted receipt)", async () => {
    const cookie = await signIn(userA);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({
        receipt: makeReceipt({ from: userA.address, status: "reverted", logs: splitLogs(splitA) }),
        flowResult: { status: "ok", flow: flowA },
      }),
    );

    const { status, body } = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(status).toBe(422);
    expect(body.error.code).toBe("RECEIPT_FAILED");
  });

  it("returns 422 when no receipt exists", async () => {
    const cookie = await signIn(userA);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: null, flowResult: { status: "ok", flow: flowA } }),
    );

    const { status, body } = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(status).toBe(422);
    expect(body.error.code).toBe("RECEIPT_NOT_FOUND");
  });

  it("returns 422 RECEIPT_HASH_MISMATCH and records nothing for a receipt bound to another hash", async () => {
    const cookie = await signIn(userA);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({
        receipt: makeReceipt({
          transactionHash: TX_HASH_B,
          from: userA.address,
          logs: splitLogs(splitA),
        }),
        flowResult: { status: "ok", flow: flowA },
      }),
    );

    const { status, body } = await readJson(await verifyExecution(TX_HASH_A, cookie));
    expect(status).toBe(422);
    expect(body.error.code).toBe("RECEIPT_HASH_MISMATCH");

    const history = await readJson(
      await historyRoute.GET(jsonGet("https://app.agentpay.example/api/payments/history", cookie)),
    );
    expect(history.body.flowExecutions).toEqual([]);
  });

  it("scopes flow executions in history to the authenticated wallet", async () => {
    const cookieA = await signIn(userA);
    const cookieB = await signIn(userB);
    chain.setArcFlowChainReaderForTesting(
      makeFlowChainReader({ receipt: receiptA, flowResult: { status: "ok", flow: flowA } }),
    );

    const recorded = await readJson(await verifyExecution(TX_HASH_A, cookieA));
    expect(recorded.status).toBe(200);

    const historyA = await readJson(
      await historyRoute.GET(jsonGet("https://app.agentpay.example/api/payments/history", cookieA)),
    );
    expect(historyA.status).toBe(200);
    expect(historyA.body.flowExecutions).toHaveLength(1);
    expect(historyA.body.flowExecutions[0].flowId).toBe("1");
    // Flow executions never leak into the agent-payment track.
    expect(historyA.body.records).toEqual([]);

    const historyB = await readJson(
      await historyRoute.GET(jsonGet("https://app.agentpay.example/api/payments/history", cookieB)),
    );
    expect(historyB.status).toBe(200);
    expect(historyB.body.flowExecutions).toEqual([]);
  });
});

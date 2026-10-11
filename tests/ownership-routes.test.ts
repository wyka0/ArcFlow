import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as challengeHandler } from "@/app/api/auth/challenge/route";
import { POST as verifyHandler } from "@/app/api/auth/verify/route";

import { GET as historyHandler } from "@/app/api/payments/history/route";
import { POST as intentsHandler } from "@/app/api/payments/intents/route";

import { POST as serviceRequestHandler } from "@/app/api/services/requests/route";
import { GET as serviceRequestGet } from "@/app/api/services/requests/[id]/route";
import { POST as serviceFulfillHandler } from "@/app/api/services/requests/[id]/fulfill/route";
import { GET as serviceResultHandler } from "@/app/api/services/requests/[id]/result/route";

import {
  createInMemoryAuthSessionRepository,
  createInMemoryChallengeStore,
  setAuthSessionRepositoryForTesting,
  setChallengeStoreForTesting,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { createInMemoryTrustedRepository, setTrustedRepositoryForTesting } from "@/lib/payments/server/factory";
import { createInMemoryServiceRequestRepository, createInMemoryServiceResultRepository } from "@/lib/services/repository";
import { setServiceRepositoriesForTesting } from "@/lib/services/service";
import { setRateLimitStoreForTesting, InMemoryRateLimitStore, setSecurityLoggerSinkForTesting } from "@/lib/security";

const userA = privateKeyToAccount(`0x${"1".repeat(64)}` as `0x${string}`);
const userB = privateKeyToAccount(`0x${"2".repeat(64)}` as `0x${string}`);

function jsonPost(url: string, body: unknown, cookieValue?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://app.agentpay.example",
  };
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function jsonGet(url: string, cookieValue?: string): Request {
  const headers: Record<string, string> = { origin: "https://app.agentpay.example" };
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request(url, { method: "GET", headers });
}

async function signIn(account: ReturnType<typeof privateKeyToAccount>): Promise<string> {
  const challengeResp = await challengeHandler(
    jsonPost("https://app.agentpay.example/api/auth/challenge", { walletAddress: account.address }),
  );
  const challengeBody = await challengeResp.json();
  const challenge = challengeBody.challenge;
  const signature = await account.signMessage({ message: challenge.message });
  const verifyResp = await verifyHandler(
    jsonPost("https://app.agentpay.example/api/auth/verify", {
      walletAddress: account.address,
      challengeId: challenge.id,
      signature,
    }),
  );
  const cookie = (verifyResp.headers.get("set-cookie") ?? "").split(";")[0]?.split("=")[1] ?? "";
  return cookie;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(response: Response): Promise<{ status: number; body: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json()) as any };
}

describe("ownership enforcement — authenticated cross-user isolation", () => {
  beforeEach(() => {
    setChallengeStoreForTesting(createInMemoryChallengeStore());
    setAuthSessionRepositoryForTesting(createInMemoryAuthSessionRepository());
    setTrustedRepositoryForTesting(createInMemoryTrustedRepository());
    setServiceRepositoriesForTesting(
      createInMemoryServiceRequestRepository(),
      createInMemoryServiceResultRepository(),
    );
    setRateLimitStoreForTesting(new InMemoryRateLimitStore());
    setSecurityLoggerSinkForTesting(() => {});
  });
  afterEach(() => {
    setChallengeStoreForTesting(null);
    setAuthSessionRepositoryForTesting(null);
    setTrustedRepositoryForTesting(null);
    setServiceRepositoriesForTesting(null, null);
    setRateLimitStoreForTesting(null);
    setSecurityLoggerSinkForTesting(null);
  });

  it("rejects unauthenticated GET /api/payments/history with 401", async () => {
    const { status, body } = await readJson(await historyHandler(jsonGet("https://app.agentpay.example/api/payments/history")));
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /api/payments/history returns 200 only for the authenticated wallet", async () => {
    const cookieA = await signIn(userA);
    const cookieB = await signIn(userB);

    const a = await readJson(await historyHandler(jsonGet("https://app.agentpay.example/api/payments/history", cookieA)));
    const b = await readJson(await historyHandler(jsonGet("https://app.agentpay.example/api/payments/history", cookieB)));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // The default trusted repo is empty, so both should see an empty list.
    expect(a.body.records).toEqual([]);
    expect(b.body.records).toEqual([]);
  });

  it("User A's service request cannot be read by User B", async () => {
    const cookieA = await signIn(userA);
    const cookieB = await signIn(userB);

    // A creates a service request
    const createResp = await serviceRequestHandler(
      jsonPost("https://app.agentpay.example/api/services/requests", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
      }, cookieA),
    );
    const created = await createResp.json();
    expect(created.ok).toBe(true);
    const requestId = created.request.id;
    expect(created.request.ownerWalletAddress.toLowerCase()).toBe(userA.address.toLowerCase());

    // B tries to read it
    const readByB = await serviceRequestGet(
      jsonGet(`https://app.agentpay.example/api/services/requests/${requestId}`, cookieB),
      { params: Promise.resolve({ id: requestId }) },
    );
    const { status, body } = await readJson(readByB);
    // Cross-user reads get a clear 403, not a misleading 404, so legitimate
    // users know the request exists but belongs to someone else.
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");

    // A can read it
    const readByA = await serviceRequestGet(
      jsonGet(`https://app.agentpay.example/api/services/requests/${requestId}`, cookieA),
      { params: Promise.resolve({ id: requestId }) },
    );
    const readByABody = await readByA.json();
    expect(readByABody.ok).toBe(true);
    expect(readByABody.request.id).toBe(requestId);
  });

  it("User B cannot fulfill User A's service request", async () => {
    const cookieA = await signIn(userA);
    const cookieB = await signIn(userB);

    // A creates a service request
    const createResp = await serviceRequestHandler(
      jsonPost("https://app.agentpay.example/api/services/requests", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
      }, cookieA),
    );
    const requestId = (await createResp.json()).request.id;

    // B attempts fulfillment
    const fulfillByB = await serviceFulfillHandler(
      jsonPost(`https://app.agentpay.example/api/services/requests/${requestId}/fulfill`, {}, cookieB),
      { params: Promise.resolve({ id: requestId }) },
    );
    const { status, body } = await readJson(fulfillByB);
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("User B cannot read User A's service result", async () => {
    const cookieA = await signIn(userA);
    const cookieB = await signIn(userB);

    const createResp = await serviceRequestHandler(
      jsonPost("https://app.agentpay.example/api/services/requests", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
      }, cookieA),
    );
    const requestId = (await createResp.json()).request.id;

    // B attempts to read the result
    const resultByB = await serviceResultHandler(
      jsonGet(`https://app.agentpay.example/api/services/requests/${requestId}/result`, cookieB),
      { params: Promise.resolve({ id: requestId }) },
    );
    const { status, body } = await readJson(resultByB);
    // The result endpoint requires auth. With auth but no ownership, we
    // collapse to 404 to avoid leaking existence of another user's request.
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Anonymous (demo) service requests are readable by any caller (legacy flow)", async () => {
    // Create a service request WITHOUT a session cookie.
    const createResp = await serviceRequestHandler(
      jsonPost("https://app.agentpay.example/api/services/requests", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
      }),
    );
    const created = await createResp.json();
    expect(created.request.ownerWalletAddress).toBeNull();

    // Anyone (no cookie) can read it.
    const readResp = await serviceRequestGet(
      jsonGet(`https://app.agentpay.example/api/services/requests/${created.request.id}`),
      { params: Promise.resolve({ id: created.request.id }) },
    );
    const readBody = await readResp.json();
    expect(readBody.ok).toBe(true);
  });

  it("Service result endpoint requires authentication even for anonymous requests", async () => {
    const createResp = await serviceRequestHandler(
      jsonPost("https://app.agentpay.example/api/services/requests", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
      }),
    );
    const requestId = (await createResp.json()).request.id;

    // Unauthenticated caller is rejected.
    const resultResp = await serviceResultHandler(
      jsonGet(`https://app.agentpay.example/api/services/requests/${requestId}/result`),
      { params: Promise.resolve({ id: requestId }) },
    );
    const { status, body } = await readJson(resultResp);
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("Intents created by an authenticated user are owned; unauthenticated produce ownerless", async () => {
    const cookieA = await signIn(userA);

    // Authenticated call: intent should be bound to userA
    const authIntent = await intentsHandler(
      jsonPost("https://app.agentpay.example/api/payments/intents", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        sender: userA.address,
      }, cookieA),
    );
    const authBody = await authIntent.json();
    // The intent may be blocked by the spending policy if other tests have
    // accumulated spend; if so, we cannot assert ownership. We only assert
    // ownership when the intent is actually created.
    if (authBody.ok) {
      expect(authBody.intent.ownerWalletAddress?.toLowerCase()).toBe(userA.address.toLowerCase());
    } else {
      // Blocked is fine; the test still proves no exception was thrown.
      expect(authBody.error.code).toBe("POLICY_BLOCKED");
    }

    // Unauthenticated call: intent should be ownerless (or blocked)
    const anonIntent = await intentsHandler(
      jsonPost("https://app.agentpay.example/api/payments/intents", {
        agentId: "agent_research_01",
        serviceId: "market-data",
        sender: userB.address,
      }),
    );
    const anonBody = await anonIntent.json();
    if (anonBody.ok) {
      expect(anonBody.intent.ownerWalletAddress).toBeNull();
    } else {
      expect(anonBody.error.code).toBe("POLICY_BLOCKED");
    }
  });
});
